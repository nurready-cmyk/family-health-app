"""Ввод показателей анализов текстом + сборка рекомендаций.

Портировано из telegram-bot/Code.gs (parseAnalysisText_) и связывает
core/norms.py, core/rules.py и core/knowledge_base.py в один сценарий:
сохранить показатели -> найти отклонения -> сначала личные правила, потом
общие рекомендации.
"""

import re
from dataclasses import dataclass
from datetime import date
from typing import Optional

from core.access import AccessContext
from core.exceptions import AccessDeniedError
from core.knowledge_base import KnowledgeBaseService
from core.norms import (
    NORMS,
    CustomIndicator,
    NormCheckResult,
    check_norm,
    match_indicator_key,
    set_custom_indicators,
    set_norm_overrides,
)
from core.rules import Rule, get_active_recommendations
from database.interfaces import AnalysesRepository, NormsRepository, PersonalNormsRepository
from database.models import KnowledgeRule

_BLOOD_PRESSURE_PATTERN = re.compile(r"давлен\w*\D{0,10}(\d{2,3})\s*/\s*(\d{2,3})", re.IGNORECASE)
_INDICATOR_VALUE_PATTERN = re.compile(r"^(.*?)(-?\d+(?:[.,]\d+)?)\s*$")
_TODAY_WORDS = {"сегодня", "today", "-"}
_DMY_PATTERN = re.compile(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$")


def parse_flexible_date(text: str) -> Optional[str]:
    """Разобрать дату анализа, введённую пользователем, в ISO-строку.

    Понимает «сегодня»/«today»/«-» (текущая дата), ДД.ММ.ГГГГ и ГГГГ-ММ-ДД —
    нужно для ввода исторических анализов (например, сданных год назад),
    а не только «прямо сейчас».
    """
    normalized = text.strip().lower()
    if normalized in _TODAY_WORDS:
        return date.today().isoformat()

    dmy_match = _DMY_PATTERN.match(normalized)
    if dmy_match:
        day, month, year = (int(part) for part in dmy_match.groups())
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return None

    try:
        return date.fromisoformat(normalized).isoformat()
    except ValueError:
        return None


def parse_analysis_text(text: str) -> dict[str, float]:
    """Разобрать свободный текст вида «гемоглобин 135, давление 120/80» в
    {indicator_key: value}. Показатели, которые не удалось распознать по
    core.norms.INDICATOR_ALIASES, молча пропускаются.
    """
    results: dict[str, float] = {}
    remaining = text

    bp_match = _BLOOD_PRESSURE_PATTERN.search(text)
    if bp_match:
        results["systolic"] = float(bp_match.group(1))
        results["diastolic"] = float(bp_match.group(2))
        remaining = remaining.replace(bp_match.group(0), "")

    # Запятая — и разделитель показателей, и десятичный разделитель
    # ("глюкоза 5,2"). Не разбиваем по запятой, если сразу после неё цифра —
    # тогда это, скорее всего, часть дробного числа, а не новый показатель.
    for part in re.split(r"[;\n]|,(?!\d)", remaining):
        part = part.strip()
        if not part:
            continue
        match = _INDICATOR_VALUE_PATTERN.match(part)
        if not match:
            continue
        name = match.group(1).strip()
        if not name:
            continue
        try:
            value = float(match.group(2).replace(",", "."))
        except ValueError:
            continue
        key = match_indicator_key(name)
        if key:
            results[key] = value

    return results


@dataclass(frozen=True)
class IndicatorReading:
    """Один только что введённый показатель вместе с результатом сверки нормы."""

    indicator_key: str
    value: float
    norm_check: NormCheckResult | None


@dataclass(frozen=True)
class AnalysisResult:
    """Итог обработки одного сообщения с анализами: что записано + рекомендации."""

    readings: list[IndicatorReading]
    personal_rules: list[KnowledgeRule]
    general_recommendations: list[Rule]


class AnalysisService:
    """Оркестрирует сохранение показателей и сборку рекомендаций."""

    def __init__(
        self,
        analyses_repository: AnalysesRepository,
        knowledge_base_service: KnowledgeBaseService,
        norms_repository: NormsRepository,
        personal_norms_repository: PersonalNormsRepository,
    ) -> None:
        self._analyses_repository = analyses_repository
        self._knowledge_base_service = knowledge_base_service
        self._norms_repository = norms_repository
        self._personal_norms_repository = personal_norms_repository

    def refresh_indicator_catalog(self, family_member_id: Optional[str] = None) -> None:
        """Подтянуть Справочник_Анализов в core.norms перед распознаванием текста
        и/или сверкой с нормой: и переопределения нормы для встроенных
        показателей, и показатели, которых нет в коде вообще (добавлены
        только в таблице, например МНО) — их русское название начинает
        работать как алиас в свободном тексте, а сама норма (если задана)
        учитывается при сверке.

        Если передан family_member_id — поверх общей нормы по полу
        накладывается персональная (Личные_Нормы), нужна, например, для
        детей, у которых норма отличается не только по полу, но и по возрасту.
        """
        catalog = self._norms_repository.get_catalog()

        general_overrides: dict[str, tuple[tuple[float, float], tuple[float, float]]] = {}
        custom_indicators: dict[str, CustomIndicator] = {}
        for key, (label, male_range, female_range) in catalog.items():
            if key in NORMS:
                if male_range is not None or female_range is not None:
                    general_overrides[key] = (male_range, female_range)
            else:
                custom_indicators[key] = CustomIndicator(label, male_range, female_range)
        set_custom_indicators(custom_indicators)

        if family_member_id is None:
            set_norm_overrides(general_overrides)
            return

        personal_overrides = self._personal_norms_repository.get_overrides(family_member_id)
        merged = dict(general_overrides)
        for indicator_key, norm_range in personal_overrides.items():
            merged[indicator_key] = (norm_range, norm_range)
        set_norm_overrides(merged)

    def parse_indicators(self, text: str) -> dict[str, float]:
        """Распознать показатели в свободном тексте, предварительно подтянув
        актуальный Справочник_Анализов — иначе показатель, добавленный туда
        только что, не будет узнан (см. refresh_indicator_catalog)."""
        self.refresh_indicator_catalog()
        return parse_analysis_text(text)

    def record_analysis(
        self,
        access: AccessContext,
        family_member_id: str,
        indicators: dict[str, float],
        entry_date: str,
    ) -> AnalysisResult:
        """Сохранить показатели и вернуть отклонения + рекомендации (личные впереди общих)."""
        if not access.can_act_for(family_member_id):
            raise AccessDeniedError("Нет прав вносить данные за этого члена семьи")

        self.refresh_indicator_catalog(family_member_id)
        gender = self._resolve_gender(access, family_member_id)

        for indicator_key, value in indicators.items():
            self._analyses_repository.add(family_member_id, entry_date, indicator_key, str(value))

        readings, abnormal_keys = self._build_readings(indicators, gender)
        latest_values = self._analyses_repository.get_latest_values(family_member_id)
        personal_rules = self._knowledge_base_service.get_matching_rules(family_member_id, abnormal_keys)
        general_recommendations = get_active_recommendations(latest_values, gender)

        return AnalysisResult(
            readings=readings,
            personal_rules=personal_rules,
            general_recommendations=general_recommendations,
        )

    def get_current_status(self, access: AccessContext, family_member_id: str) -> AnalysisResult:
        """Отчёт по всем последним известным показателям — без нового ввода.

        Используется командой /report, чтобы посмотреть текущие отклонения
        и рекомендации (включая личные правила) в любой момент, а не только
        сразу после ввода анализа.
        """
        if not access.can_act_for(family_member_id):
            raise AccessDeniedError("Нет прав смотреть данные этого члена семьи")

        self.refresh_indicator_catalog(family_member_id)
        gender = self._resolve_gender(access, family_member_id)
        latest_values = self._analyses_repository.get_latest_values(family_member_id)

        numeric_values: dict[str, float] = {}
        for indicator_key, raw_value in latest_values.items():
            try:
                numeric_values[indicator_key] = float(raw_value)
            except ValueError:
                continue

        readings, abnormal_keys = self._build_readings(numeric_values, gender)
        personal_rules = self._knowledge_base_service.get_matching_rules(family_member_id, abnormal_keys)
        general_recommendations = get_active_recommendations(latest_values, gender)

        return AnalysisResult(
            readings=readings,
            personal_rules=personal_rules,
            general_recommendations=general_recommendations,
        )

    @staticmethod
    def _build_readings(
        indicators: dict[str, float], gender: str
    ) -> tuple[list[IndicatorReading], list[str]]:
        """Сверить каждый показатель с нормой; вернуть (readings, ключи с отклонением)."""
        readings: list[IndicatorReading] = []
        abnormal_keys: list[str] = []
        for indicator_key, value in indicators.items():
            norm_check = check_norm(indicator_key, value, gender)
            readings.append(IndicatorReading(indicator_key=indicator_key, value=value, norm_check=norm_check))
            if norm_check is not None and norm_check.status != "normal":
                abnormal_keys.append(indicator_key)
        return readings, abnormal_keys

    @staticmethod
    def _resolve_gender(access: AccessContext, family_member_id: str) -> str:
        # can_act_for() уже гарантировал, что family_member_id есть в
        # allowed_family_members — если его вдруг нет, это баг в вызывающем
        # коде, и тихий дефолт на "male" исказил бы медицинские нормы молча.
        for member in access.allowed_family_members:
            if member.id == family_member_id:
                return member.gender
        raise ValueError(f"family_member_id {family_member_id!r} не найден в allowed_family_members")

