"""core/norms.py: сверка с нормой и распознавание названий показателей."""

from core.norms import check_norm, match_indicator_key


def test_check_norm_detects_low_value():
    result = check_norm("hemoglobin", 100, "male")
    assert result.status == "low"


def test_check_norm_detects_normal_value():
    result = check_norm("hemoglobin", 150, "male")
    assert result.status == "normal"


def test_check_norm_detects_high_value():
    result = check_norm("hemoglobin", 200, "male")
    assert result.status == "high"


def test_check_norm_uses_different_ranges_by_gender():
    # 125 г/л — норма для женщины, но ниже нормы для мужчины
    assert check_norm("hemoglobin", 125, "female").status == "normal"
    assert check_norm("hemoglobin", 125, "male").status == "low"


def test_check_norm_returns_none_for_unknown_indicator():
    assert check_norm("unknown_indicator", 1, "male") is None


def test_match_indicator_key_finds_exact_alias():
    assert match_indicator_key("гемоглобин") == "hemoglobin"


def test_match_indicator_key_prefers_longest_alias():
    # "холестерин общий" не должен потеряться за более коротким "холестерин"
    assert match_indicator_key("холестерин общий") == "cholesterol"
    assert match_indicator_key("холестерин") == "cholesterol"
    assert match_indicator_key("лпнп") == "ldl"


def test_match_indicator_key_returns_none_for_unrecognized_text():
    assert match_indicator_key("совершенно непонятное слово") is None

