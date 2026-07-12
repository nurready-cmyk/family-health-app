"""core/analyses.py: parse_analysis_text — разбор свободного текста в показатели,
parse_flexible_date — разбор даты (в т.ч. исторической) для /analysis."""

from datetime import date

from core.analyses import parse_analysis_text, parse_flexible_date


def test_parses_single_indicator():
    assert parse_analysis_text("гемоглобин 135") == {"hemoglobin": 135.0}


def test_parses_multiple_indicators_separated_by_comma():
    result = parse_analysis_text("гемоглобин 100, глюкоза 5.2")
    assert result == {"hemoglobin": 100.0, "glucose": 5.2}


def test_parses_indicators_separated_by_newline():
    result = parse_analysis_text("гемоглобин 100\nглюкоза 5.2")
    assert result == {"hemoglobin": 100.0, "glucose": 5.2}


def test_parses_blood_pressure_as_two_indicators():
    result = parse_analysis_text("давление 120/80")
    assert result == {"systolic": 120.0, "diastolic": 80.0}


def test_parses_blood_pressure_combined_with_other_indicators():
    result = parse_analysis_text("гемоглобин 135, давление 120/80, глюкоза 5.0")
    assert result == {"hemoglobin": 135.0, "systolic": 120.0, "diastolic": 80.0, "glucose": 5.0}


def test_handles_decimal_comma_as_dot():
    assert parse_analysis_text("глюкоза 5,2") == {"glucose": 5.2}


def test_ignores_unrecognized_indicator_names():
    result = parse_analysis_text("непонятный показатель 42")
    assert result == {}


def test_returns_empty_dict_for_text_without_numbers():
    assert parse_analysis_text("просто текст без цифр") == {}


# ---------- parse_flexible_date ----------


def test_parse_flexible_date_accepts_segodnya():
    assert parse_flexible_date("сегодня") == date.today().isoformat()


def test_parse_flexible_date_accepts_today_and_dash():
    assert parse_flexible_date("today") == date.today().isoformat()
    assert parse_flexible_date("-") == date.today().isoformat()


def test_parse_flexible_date_accepts_dmy_format():
    assert parse_flexible_date("15.07.2025") == "2025-07-15"


def test_parse_flexible_date_accepts_dmy_with_different_separators():
    assert parse_flexible_date("15-07-2025") == "2025-07-15"
    assert parse_flexible_date("15/07/2025") == "2025-07-15"


def test_parse_flexible_date_accepts_iso_format():
    assert parse_flexible_date("2025-07-15") == "2025-07-15"


def test_parse_flexible_date_accepts_single_digit_day_and_month():
    assert parse_flexible_date("5.7.2025") == "2025-07-05"


def test_parse_flexible_date_rejects_invalid_calendar_date():
    assert parse_flexible_date("31.02.2025") is None


def test_parse_flexible_date_rejects_garbage():
    assert parse_flexible_date("не дата") is None
    assert parse_flexible_date("") is None

