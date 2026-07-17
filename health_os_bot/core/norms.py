"""Медицинские нормы показателей анализов.

Портировано из telegram-bot/Norms.gs (GAS-версия бота) — те же данные и та
же логика, один в один. NamedTuple вместо словаря с male/female ради
типобезопасности при доступе к диапазону.
"""

from typing import NamedTuple, Optional


class NormRange(NamedTuple):
    label: str
    unit: str
    male: tuple[float, float]
    female: tuple[float, float]


NORMS: dict[str, NormRange] = {
    "hemoglobin": NormRange("Гемоглобин", "г/л", (130, 170), (120, 155)),
    "rbc": NormRange("Эритроциты", "×10¹²/л", (4.0, 5.5), (3.7, 4.7)),
    "wbc": NormRange("Лейкоциты", "×10⁹/л", (4.0, 9.0), (4.0, 9.0)),
    "platelets": NormRange("Тромбоциты", "×10⁹/л", (150, 400), (150, 400)),
    "glucose": NormRange("Глюкоза", "ммоль/л", (3.9, 6.1), (3.9, 6.1)),
    "cholesterol": NormRange("Холестерин общий", "ммоль/л", (0, 5.2), (0, 5.2)),
    "hdl": NormRange("ЛПВП (хороший холестерин)", "ммоль/л", (1.0, 99), (1.2, 99)),
    "ldl": NormRange("ЛПНП (плохой холестерин)", "ммоль/л", (0, 3.4), (0, 3.4)),
    "alt": NormRange("АЛТ", "Ед/л", (0, 41), (0, 31)),
    "ast": NormRange("АСТ", "Ед/л", (0, 40), (0, 32)),
    "ferritin": NormRange("Ферритин", "нг/мл", (30, 300), (12, 150)),
    "vitaminD": NormRange("Витамин D", "нг/мл", (30, 100), (30, 100)),
    "tsh": NormRange("ТТГ (щитовидная железа)", "мЕд/л", (0.4, 4.0), (0.4, 4.0)),
    "creatinine": NormRange("Креатинин", "мкмоль/л", (62, 115), (53, 97)),
    "uricAcid": NormRange("Мочевая кислота", "мкмоль/л", (208, 428), (155, 357)),
    "vitaminB12": NormRange("Витамин B12", "пг/мл", (200, 900), (200, 900)),
    "iron": NormRange("Железо сывороточное", "мкмоль/л", (11.6, 31.3), (9.0, 30.4)),
    "systolic": NormRange("Давление систолическое", "мм рт.ст.", (90, 130), (90, 130)),
    "diastolic": NormRange("Давление диастолическое", "мм рт.ст.", (60, 85), (60, 85)),
}


class NormCheckResult(NamedTuple):
    status: str  # 'normal' | 'low' | 'high'
    min: float
    max: float
    label: str
    unit: str


class CustomIndicator(NamedTuple):
    """Показатель, которого нет в NORMS — пользователь добавил его сам в
    Справочник_Анализов (например МНО). Норма может быть ещё не задана."""

    label: str
    male_range: Optional[tuple[float, float]]
    female_range: Optional[tuple[float, float]]


# Нормы, которые пользователь вписал сам в Справочник_Анализов (колонки "Норма
# (мужчины)"/"Норма (женщины)") для показателей, УЖЕ известных коду (есть в
# NORMS) — {indicator_key: (мужской диапазон, женский диапазон)}.
_norm_overrides: dict[str, tuple[tuple[float, float], tuple[float, float]]] = {}

# Показатели, которых нет в NORMS вообще — пользователь добавил их сам в
# Справочник_Анализов с нуля (новое русское название + свой код).
_custom_indicators: dict[str, CustomIndicator] = {}


def set_norm_overrides(overrides: dict[str, tuple[tuple[float, float], tuple[float, float]]]) -> None:
    global _norm_overrides
    _norm_overrides = overrides


def set_custom_indicators(custom_indicators: dict[str, CustomIndicator]) -> None:
    """Обновляется перед каждым /analysis и /report (см. core/analyses.py),
    поэтому новые строки в Справочник_Анализов подхватываются без
    перезапуска бота — и для распознавания в тексте, и для сверки с нормой.
    """
    global _custom_indicators
    _custom_indicators = custom_indicators


def get_indicator_label(indicator_key: str) -> str:
    """Русское название показателя для отображения — из NORMS или из
    пользовательского справочника. Сырой код — крайний случай (не должен
    происходить, если показатель вообще был распознан при вводе)."""
    if indicator_key in NORMS:
        return NORMS[indicator_key].label
    custom = _custom_indicators.get(indicator_key)
    return custom.label if custom else indicator_key


def get_indicator_unit(indicator_key: str) -> str:
    """Единица измерения — известна только для встроенных показателей;
    для добавленных пользователем в таблице колонки под единицу нет."""
    return NORMS[indicator_key].unit if indicator_key in NORMS else ""


def check_norm(indicator_key: str, value: float, gender: str) -> Optional[NormCheckResult]:
    """Сравнить значение показателя с нормой по полу.

    Сначала пробует NORMS (+ _norm_overrides поверх, если пользователь
    переопределил встроенную норму). Если показателя нет в NORMS вообще —
    пробует _custom_indicators (показатель, добавленный только в таблице).
    None, если показатель не распознан нигде, либо норма для него ещё не
    задана нигде (тогда значение всё равно сохраняется, просто без статуса).
    """
    norm = NORMS.get(indicator_key)
    if norm is not None:
        male_range, female_range = _norm_overrides.get(indicator_key, (norm.male, norm.female))
        label, unit = norm.label, norm.unit
    else:
        custom = _custom_indicators.get(indicator_key)
        if custom is None or (custom.male_range is None and custom.female_range is None):
            return None
        male_range = custom.male_range or custom.female_range
        female_range = custom.female_range or custom.male_range
        label, unit = custom.label, ""

    min_value, max_value = female_range if gender == "female" else male_range
    if value < min_value:
        status = "low"
    elif value > max_value:
        status = "high"
    else:
        status = "normal"

    return NormCheckResult(status=status, min=min_value, max=max_value, label=label, unit=unit)


# Русские слова, которыми member семьи, скорее всего, назовёт показатель в
# свободном тексте. Используется parse_analysis_text() в core/analyses.py.
INDICATOR_ALIASES: dict[str, list[str]] = {
    "hemoglobin": ["гемоглобин", "гем"],
    "rbc": ["эритроциты", "эритроц"],
    "wbc": ["лейкоциты", "лейк"],
    "platelets": ["тромбоциты", "тромб"],
    "glucose": ["глюкоза", "сахар"],
    "cholesterol": ["холестерин общий", "холестерин"],
    "hdl": ["лпвп", "хороший холестерин"],
    "ldl": ["лпнп", "плохой холестерин"],
    "alt": ["алт"],
    "ast": ["аст"],
    "ferritin": ["ферритин"],
    "vitaminD": ["витамин д", "витамин d", "вит д", "вит д3", "витамин д3"],
    "tsh": ["ттг"],
    "creatinine": ["креатинин"],
    "uricAcid": ["мочевая кислота", "мочевая"],
    "vitaminB12": ["витамин б12", "витамин b12", "в12", "b12", "вит б12"],
    "iron": ["железо сывороточное", "железо"],
    "systolic": ["систолическое", "верхнее давление"],
    "diastolic": ["диастолическое", "нижнее давление"],
}


def match_indicator_key(text: str) -> Optional[str]:
    """Сопоставить свободно введённое название показателя с ключом NORMS
    либо с показателем, которого нет в коде, но пользователь добавил его
    сам в Справочник_Анализов (см. _custom_indicators) — русское название
    из таблицы работает как алиас, например "МНО".

    Побеждает самый длинный алиас, чтобы "холестерин общий" не потерялся
    за более коротким "холестерин".
    """
    normalized = text.lower().strip()
    best_key: Optional[str] = None
    best_length = 0

    for key, aliases in INDICATOR_ALIASES.items():
        for alias in aliases:
            if alias in normalized and len(alias) > best_length:
                best_key = key
                best_length = len(alias)

    for key, custom in _custom_indicators.items():
        alias = custom.label.lower()
        if alias in normalized and len(alias) > best_length:
            best_key = key
            best_length = len(alias)

    return best_key

