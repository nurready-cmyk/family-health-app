"""core/analyses.py: parse_analysis_text — разбор свободного текста в показатели."""

from core.analyses import parse_analysis_text


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

