"""core/rules.py: срабатывание правил-рекомендаций на показателях."""

from core.rules import get_active_recommendations


def test_low_hemoglobin_triggers_hb_low_rule():
    recommendations = get_active_recommendations({"hemoglobin": "100"}, "male")
    ids = [rule.id for rule in recommendations]
    assert "hb_low" in ids


def test_normal_values_trigger_no_rules():
    recommendations = get_active_recommendations({"hemoglobin": "150", "glucose": "5.0"}, "male")
    assert recommendations == []


def test_high_blood_pressure_rule_uses_systolic_or_diastolic():
    assert any(r.id == "pressure_high" for r in get_active_recommendations({"systolic": "140"}, "male"))
    assert any(r.id == "pressure_high" for r in get_active_recommendations({"diastolic": "90"}, "male"))
    assert not any(r.id == "pressure_high" for r in get_active_recommendations({"systolic": "120"}, "male"))


def test_empty_values_return_no_recommendations():
    assert get_active_recommendations({}, "male") == []


def test_garbage_value_does_not_crash_rule_engine():
    # Значение не число — правило должно тихо не сработать, а не упасть
    recommendations = get_active_recommendations({"hemoglobin": "не число"}, "male")
    assert recommendations == []


def test_multiple_abnormal_indicators_trigger_multiple_rules():
    recommendations = get_active_recommendations({"hemoglobin": "100", "glucose": "8.0"}, "male")
    ids = {rule.id for rule in recommendations}
    assert {"hb_low", "glucose_high"}.issubset(ids)

