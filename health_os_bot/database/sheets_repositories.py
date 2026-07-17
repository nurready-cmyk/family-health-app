"""Реализации интерфейсов database/interfaces.py поверх Google Sheets.

Каждый класс отвечает за один лист: переводит доменные модели в плоские
словари для SheetRowStore и обратно. Бизнес-логика (core/) никогда не видит
эти классы напрямую — только абстрактные типы из interfaces.py.
"""

import re
from dataclasses import asdict
from datetime import date
from typing import Optional

from database.interfaces import (
    AnalysesRepository,
    FamilyMembersRepository,
    KnowledgeBaseRepository,
    LogsRepository,
    MedicalDataRepository,
    NormsRepository,
    PersonalNormsRepository,
    UsersRepository,
)
from database.models import AnalysisEntry, FamilyMember, KnowledgeRule, LogEntry, MedicalRecord, User
from database.sheets_client import GoogleSheetsClient, SheetRowStore

FAMILY_MEMBERS_SHEET_TITLE = "Family_Members"
FAMILY_MEMBERS_HEADERS = ["id", "name", "gender", "birth_year"]

USERS_SHEET_TITLE = "Users"
USERS_HEADERS = ["id", "tg_id", "name", "role", "family_member_id"]

LOGS_SHEET_TITLE = "Logs"
LOGS_HEADERS = ["id", "date", "family_member_id", "metric_type", "value", "notes"]

MEDICAL_DATA_SHEET_TITLE = "Medical_Data"
MEDICAL_DATA_HEADERS = ["id", "date", "family_member_id", "event_type", "summary", "document_url"]

KNOWLEDGE_BASE_SHEET_TITLE = "Knowledge_Base"
KNOWLEDGE_BASE_HEADERS = ["id", "family_member_id", "rule_text", "priority"]

ANALYSES_SHEET_TITLE = "Analyses"
ANALYSES_HEADERS = ["id", "family_member_id", "date", "indicator_key", "value"]

NORMS_REFERENCE_SHEET_TITLE = "Справочник_Анализов"
NORMS_REFERENCE_HEADERS = [
    "Русское название",
    "Код (indicator_key)",
    "Норма (мужчины)",
    "Норма (женщины)",
]
NORMS_REFERENCE_LABEL_HEADER = "Русское название"
NORMS_REFERENCE_KEY_HEADER = "Код (indicator_key)"
NORMS_REFERENCE_MALE_HEADER = "Норма (мужчины)"
NORMS_REFERENCE_FEMALE_HEADER = "Норма (женщины)"

PERSONAL_NORMS_SHEET_TITLE = "Личные_Нормы"
PERSONAL_NORMS_HEADERS = ["family_member_id", "Русское название", "Код (indicator_key)", "Норма"]
PERSONAL_NORMS_MEMBER_HEADER = "family_member_id"
PERSONAL_NORMS_KEY_HEADER = "Код (indicator_key)"
PERSONAL_NORMS_RANGE_HEADER = "Норма"

_NORM_RANGE_PATTERN = re.compile(r"^\s*(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)\s*$")


def _parse_norm_range(text: str) -> Optional[tuple[float, float]]:
    """Разобрать «120-155» в (120.0, 155.0). None, если ячейка пустая или не по формату."""
    if not text:
        return None
    match = _NORM_RANGE_PATTERN.match(text)
    if not match:
        return None
    return (float(match.group(1).replace(",", ".")), float(match.group(2).replace(",", ".")))


_CYRILLIC_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def _slugify_name(name: str) -> str:
    """«Адель» -> «adel» — короткий понятный id вместо UUID, чтобы в выпадающем
    списке Analyses!family_member_id сразу было видно, о ком речь, без сверки
    с листом Family_Members.
    """
    letters = [_CYRILLIC_TO_LATIN.get(char, char) for char in name.lower() if char.isalpha()]
    slug = "".join(letters)[:5]
    return slug or "person"


class FamilyMembersSheetsRepository(FamilyMembersRepository):
    def __init__(self, client: GoogleSheetsClient) -> None:
        worksheet = client.get_or_create_worksheet(FAMILY_MEMBERS_SHEET_TITLE, FAMILY_MEMBERS_HEADERS)
        self._store = SheetRowStore(worksheet, FAMILY_MEMBERS_HEADERS)

    def add(self, name: str, gender: str, birth_year: int) -> FamilyMember:
        member = FamilyMember(
            id=self._generate_id(name), name=name, gender=gender, birth_year=birth_year
        )
        self._store.append(asdict(member))
        return member

    def _generate_id(self, name: str) -> str:
        """Короткий id на основе имени; при совпадении с уже существующим —
        добавляет цифру на конце (redkий случай — тёзки в одной семье)."""
        base = _slugify_name(name)
        existing_ids = {str(row.get("id")) for row in self._store.read_all()}

        candidate = base
        suffix = 1
        while candidate in existing_ids:
            suffix += 1
            digits = str(suffix)
            candidate = f"{base[: max(1, 5 - len(digits))]}{digits}"
        return candidate

    def get_all(self) -> list[FamilyMember]:
        return [self._row_to_model(row) for row in self._store.read_all()]

    def get_by_id(self, family_member_id: str) -> Optional[FamilyMember]:
        for member in self.get_all():
            if member.id == family_member_id:
                return member
        return None

    @staticmethod
    def _row_to_model(row: dict) -> FamilyMember:
        return FamilyMember(
            id=str(row["id"]),
            name=str(row["name"]),
            gender=str(row["gender"]),
            birth_year=int(row["birth_year"]) if row.get("birth_year") else 0,
        )


class UsersSheetsRepository(UsersRepository):
    def __init__(self, client: GoogleSheetsClient) -> None:
        worksheet = client.get_or_create_worksheet(USERS_SHEET_TITLE, USERS_HEADERS)
        self._store = SheetRowStore(worksheet, USERS_HEADERS)

    def add(self, tg_id: int, name: str, role: str, family_member_id: str) -> User:
        user = User(
            id=self._store.generate_id(),
            tg_id=tg_id,
            name=name,
            role=role,
            family_member_id=family_member_id,
        )
        self._store.append(asdict(user))
        return user

    def get_by_tg_id(self, tg_id: int) -> Optional[User]:
        for user in self.get_all():
            if user.tg_id == tg_id:
                return user
        return None

    def get_all(self) -> list[User]:
        return [self._row_to_model(row) for row in self._store.read_all()]

    @staticmethod
    def _row_to_model(row: dict) -> User:
        return User(
            id=str(row["id"]),
            tg_id=int(row["tg_id"]) if row.get("tg_id") else 0,
            name=str(row["name"]),
            role=str(row["role"]),
            family_member_id=str(row["family_member_id"]),
        )


class LogsSheetsRepository(LogsRepository):
    def __init__(self, client: GoogleSheetsClient) -> None:
        worksheet = client.get_or_create_worksheet(LOGS_SHEET_TITLE, LOGS_HEADERS)
        self._store = SheetRowStore(worksheet, LOGS_HEADERS)

    def add(
        self, entry_date: str, family_member_id: str, metric_type: str, value: str, notes: str
    ) -> LogEntry:
        entry = LogEntry(
            id=self._store.generate_id(),
            date=entry_date,
            family_member_id=family_member_id,
            metric_type=metric_type,
            value=value,
            notes=notes,
        )
        self._store.append(asdict(entry))
        return entry

    def get_by_family_member_id(self, family_member_id: str) -> list[LogEntry]:
        return [
            self._row_to_model(row)
            for row in self._store.read_all()
            if str(row.get("family_member_id")) == family_member_id
        ]

    def get_since(self, family_member_id: str, since_date: str) -> list[LogEntry]:
        since = date.fromisoformat(since_date)
        return [
            entry
            for entry in self.get_by_family_member_id(family_member_id)
            if _safe_parse_date(entry.date) >= since
        ]

    @staticmethod
    def _row_to_model(row: dict) -> LogEntry:
        return LogEntry(
            id=str(row["id"]),
            date=str(row["date"]),
            family_member_id=str(row["family_member_id"]),
            metric_type=str(row["metric_type"]),
            value=str(row["value"]),
            notes=str(row["notes"]),
        )


class MedicalDataSheetsRepository(MedicalDataRepository):
    def __init__(self, client: GoogleSheetsClient) -> None:
        worksheet = client.get_or_create_worksheet(MEDICAL_DATA_SHEET_TITLE, MEDICAL_DATA_HEADERS)
        self._store = SheetRowStore(worksheet, MEDICAL_DATA_HEADERS)

    def add(
        self,
        record_date: str,
        family_member_id: str,
        event_type: str,
        summary: str,
        document_url: str,
    ) -> MedicalRecord:
        record = MedicalRecord(
            id=self._store.generate_id(),
            date=record_date,
            family_member_id=family_member_id,
            event_type=event_type,
            summary=summary,
            document_url=document_url,
        )
        self._store.append(asdict(record))
        return record

    def get_by_family_member_id(self, family_member_id: str) -> list[MedicalRecord]:
        return [
            self._row_to_model(row)
            for row in self._store.read_all()
            if str(row.get("family_member_id")) == family_member_id
        ]

    @staticmethod
    def _row_to_model(row: dict) -> MedicalRecord:
        return MedicalRecord(
            id=str(row["id"]),
            date=str(row["date"]),
            family_member_id=str(row["family_member_id"]),
            event_type=str(row["event_type"]),
            summary=str(row["summary"]),
            document_url=str(row["document_url"]),
        )


class KnowledgeBaseSheetsRepository(KnowledgeBaseRepository):
    def __init__(self, client: GoogleSheetsClient) -> None:
        worksheet = client.get_or_create_worksheet(KNOWLEDGE_BASE_SHEET_TITLE, KNOWLEDGE_BASE_HEADERS)
        self._store = SheetRowStore(worksheet, KNOWLEDGE_BASE_HEADERS)

    def add(self, family_member_id: str, rule_text: str, priority: int) -> KnowledgeRule:
        rule = KnowledgeRule(
            id=self._store.generate_id(),
            family_member_id=family_member_id,
            rule_text=rule_text,
            priority=priority,
        )
        self._store.append(asdict(rule))
        return rule

    def get_by_family_member_id(self, family_member_id: str) -> list[KnowledgeRule]:
        rules = [
            self._row_to_model(row)
            for row in self._store.read_all()
            if str(row.get("family_member_id")) == family_member_id
        ]
        return sorted(rules, key=lambda rule: rule.priority, reverse=True)

    @staticmethod
    def _row_to_model(row: dict) -> KnowledgeRule:
        return KnowledgeRule(
            id=str(row["id"]),
            family_member_id=str(row["family_member_id"]),
            rule_text=str(row["rule_text"]),
            priority=int(row["priority"]) if row.get("priority") else 0,
        )


class AnalysesSheetsRepository(AnalysesRepository):
    def __init__(self, client: GoogleSheetsClient) -> None:
        worksheet = client.get_or_create_worksheet(ANALYSES_SHEET_TITLE, ANALYSES_HEADERS)
        self._store = SheetRowStore(worksheet, ANALYSES_HEADERS)

    def add(self, family_member_id: str, entry_date: str, indicator_key: str, value: str) -> AnalysisEntry:
        entry = AnalysisEntry(
            id=self._store.generate_id(),
            family_member_id=family_member_id,
            date=entry_date,
            indicator_key=indicator_key,
            value=value,
        )
        self._store.append(asdict(entry))
        return entry

    def get_latest_values(self, family_member_id: str) -> dict[str, str]:
        entries = sorted(
            self.get_by_family_member_id(family_member_id),
            key=lambda entry: _safe_parse_date(entry.date),
        )
        latest: dict[str, str] = {}
        for entry in entries:
            latest[entry.indicator_key] = entry.value
        return latest

    def get_by_family_member_id(self, family_member_id: str) -> list[AnalysisEntry]:
        return [
            self._row_to_model(row)
            for row in self._store.read_all()
            if str(row.get("family_member_id")) == family_member_id
        ]

    @staticmethod
    def _row_to_model(row: dict) -> AnalysisEntry:
        return AnalysisEntry(
            id=str(row["id"]),
            family_member_id=str(row["family_member_id"]),
            date=str(row["date"]),
            indicator_key=str(row["indicator_key"]),
            value=str(row["value"]),
        )


class NormsSheetsRepository(NormsRepository):
    """Читает весь справочник показателей из листа Справочник_Анализов —
    и название/норму для встроенных показателей (переопределение), и
    показатели, которых нет в core/norms.NORMS вообще (пользователь добавил
    сам, например МНО). Строка без нормы не пропускается целиком — она всё
    равно возвращается (с None вместо диапазонов), чтобы core/norms.py мог
    хотя бы распознавать название в свободном тексте, даже когда норма ещё
    не вписана.
    """

    def __init__(self, client: GoogleSheetsClient) -> None:
        self._worksheet = client.get_or_create_worksheet(
            NORMS_REFERENCE_SHEET_TITLE, NORMS_REFERENCE_HEADERS
        )

    def get_catalog(self) -> dict[str, tuple[str, Optional[tuple[float, float]], Optional[tuple[float, float]]]]:
        catalog: dict[str, tuple[str, Optional[tuple[float, float]], Optional[tuple[float, float]]]] = {}
        for row in self._worksheet.get_all_records():
            key = str(row.get(NORMS_REFERENCE_KEY_HEADER, "")).strip()
            label = str(row.get(NORMS_REFERENCE_LABEL_HEADER, "")).strip()
            if not key or not label:
                continue

            male_range = _parse_norm_range(str(row.get(NORMS_REFERENCE_MALE_HEADER, "")))
            female_range = _parse_norm_range(str(row.get(NORMS_REFERENCE_FEMALE_HEADER, "")))
            # Если заполнен только один столбец — считаем, что норма одна для всех.
            if male_range is not None or female_range is not None:
                male_range, female_range = male_range or female_range, female_range or male_range

            catalog[key] = (label, male_range, female_range)
        return catalog


class PersonalNormsSheetsRepository(PersonalNormsRepository):
    """Читает индивидуальные нормы (например, для детей) из листа Личные_Нормы.

    Формат тот же лист для всех членов семьи — колонка family_member_id
    определяет, кому принадлежит строка. Добавить нового члена семьи (ещё
    одного ребёнка, бабушку/дедушку) — просто новые строки, без изменения
    структуры листа.
    """

    def __init__(self, client: GoogleSheetsClient) -> None:
        self._worksheet = client.get_or_create_worksheet(
            PERSONAL_NORMS_SHEET_TITLE, PERSONAL_NORMS_HEADERS
        )

    def get_overrides(self, family_member_id: str) -> dict[str, tuple[float, float]]:
        overrides: dict[str, tuple[float, float]] = {}
        for row in self._worksheet.get_all_records():
            if str(row.get(PERSONAL_NORMS_MEMBER_HEADER, "")).strip() != family_member_id:
                continue

            key = str(row.get(PERSONAL_NORMS_KEY_HEADER, "")).strip()
            norm_range = _parse_norm_range(str(row.get(PERSONAL_NORMS_RANGE_HEADER, "")))
            if not key or norm_range is None:
                continue

            overrides[key] = norm_range
        return overrides


def _safe_parse_date(raw_date: str) -> date:
    """Дата в Logs хранится как строка ISO (YYYY-MM-DD) — при некорректном
    значении считаем запись максимально старой, чтобы она не ломала фильтр
    по периоду, а просто выпадала из выборки "за последние N дней".
    """
    try:
        return date.fromisoformat(raw_date[:10])
    except ValueError:
        return date.min

