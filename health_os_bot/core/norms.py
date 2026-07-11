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


def check_norm(indicator_key: str, value: float, gender: str) -> Optional[NormCheckResult]:
    """Сравнить значение показателя с нормой по полу. None, если показатель неизвестен."""
    norm = NORMS.get(indicator_key)
    if norm is None:
        return None

    min_value, max_value = norm.female if gender == "female" else norm.male
    if value < min_value:
        status = "low"
    elif value > max_value:
        status = "high"
    else:
        status = "normal"

    return NormCheckResult(status=status, min=min_value, max=max_value, label=norm.label, unit=norm.unit)


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
    """Сопоставить свободно введённое название показателя с ключом NORMS.

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

    return best_key

