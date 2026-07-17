"""core/norms.py: сверка с нормой и распознавание названий показателей."""

from core.norms import (
    CustomIndicator,
    check_norm,
    get_indicator_label,
    get_indicator_unit,
    match_indicator_key,
    set_custom_indicators,
    set_norm_overrides,
)


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


# ---------- set_norm_overrides (пользовательские нормы из Справочник_Анализов) ----------


def test_check_norm_uses_override_when_present():
    # Без override 125 г/л — ниже нормы для мужчины (test_check_norm_uses_different_ranges_by_gender)
    set_norm_overrides({"hemoglobin": ((100.0, 200.0), (100.0, 200.0))})
    assert check_norm("hemoglobin", 125, "male").status == "normal"


def test_check_norm_falls_back_to_default_for_indicators_without_override():
    set_norm_overrides({"glucose": ((0.0, 100.0), (0.0, 100.0))})
    # У гемоглобина override нет — используется дефолт из NORMS
    assert check_norm("hemoglobin", 125, "male").status == "low"


def test_check_norm_ignores_stale_overrides_after_reset():
    set_norm_overrides({"hemoglobin": ((100.0, 200.0), (100.0, 200.0))})
    set_norm_overrides({})
    assert check_norm("hemoglobin", 125, "male").status == "low"


# ---------- set_custom_indicators (показатели, которых нет в NORMS вообще) ----------


def test_match_indicator_key_finds_custom_indicator_by_its_label():
    set_custom_indicators({"INR": CustomIndicator("МНО", None, None)})
    assert match_indicator_key("мно") == "INR"


def test_check_norm_returns_none_for_custom_indicator_without_norm():
    set_custom_indicators({"INR": CustomIndicator("МНО", None, None)})
    assert check_norm("INR", 1.4, "male") is None


def test_check_norm_uses_custom_indicator_norm_when_set():
    set_custom_indicators({"INR": CustomIndicator("МНО", (0.8, 1.2), (0.8, 1.2))})
    assert check_norm("INR", 1.4, "male").status == "high"
    assert check_norm("INR", 1.0, "male").status == "normal"


def test_get_indicator_label_falls_back_to_custom_catalog():
    set_custom_indicators({"INR": CustomIndicator("МНО", None, None)})
    assert get_indicator_label("INR") == "МНО"
    assert get_indicator_label("hemoglobin") == "Гемоглобин"


def test_get_indicator_label_falls_back_to_raw_key_when_totally_unknown():
    assert get_indicator_label("совсем_незнакомый") == "совсем_незнакомый"


def test_get_indicator_unit_is_empty_for_custom_indicators():
    set_custom_indicators({"INR": CustomIndicator("МНО", None, None)})
    assert get_indicator_unit("INR") == ""
    assert get_indicator_unit("hemoglobin") == "г/л"

