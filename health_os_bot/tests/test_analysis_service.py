"""core/analyses.py: AnalysisService — сохранение показателей + сборка
рекомендаций (личные правила проверяются раньше общих)."""

import pytest

from core.analyses import AnalysisService
from core.exceptions import AccessDeniedError
from core.knowledge_base import KnowledgeBaseService


@pytest.fixture
def knowledge_base_service(knowledge_base_repo) -> KnowledgeBaseService:
    return KnowledgeBaseService(knowledge_base_repo)


@pytest.fixture
def service(analyses_repo, knowledge_base_service, norms_repo, personal_norms_repo) -> AnalysisService:
    return AnalysisService(analyses_repo, knowledge_base_service, norms_repo, personal_norms_repo)


def test_record_analysis_saves_each_indicator(service, access_service, mom, analyses_repo):
    context = access_service.resolve(222)
    service.record_analysis(context, mom.id, {"hemoglobin": 100.0}, "2026-07-01")
    assert len(analyses_repo.get_by_family_member_id(mom.id)) == 1


def test_record_analysis_returns_general_recommendation_for_abnormal_value(service, access_service, mom):
    context = access_service.resolve(222)
    result = service.record_analysis(context, mom.id, {"hemoglobin": 100.0}, "2026-07-01")

    assert result.readings[0].norm_check.status == "low"
    assert any(rule.id == "hb_low" for rule in result.general_recommendations)
    assert result.personal_rules == []


def test_record_analysis_returns_no_recommendation_for_normal_value(service, access_service, mom):
    context = access_service.resolve(222)
    result = service.record_analysis(context, mom.id, {"hemoglobin": 150.0}, "2026-07-01")

    assert result.readings[0].norm_check.status == "normal"
    assert result.general_recommendations == []


def test_personal_rule_appears_when_indicator_abnormal(
    service, access_service, mom, knowledge_base_service
):
    context = access_service.resolve(222)
    knowledge_base_service.add_rule(context, mom.id, "если гемоглобин низкий, помогает гранат")

    result = service.record_analysis(context, mom.id, {"hemoglobin": 100.0}, "2026-07-01")

    assert len(result.personal_rules) == 1
    assert "гранат" in result.personal_rules[0].rule_text
    # Общая рекомендация тоже должна остаться — личные не заменяют общие, а дополняют
    assert any(rule.id == "hb_low" for rule in result.general_recommendations)


def test_user_cannot_record_analysis_for_someone_else(service, access_service, dad, mom):
    context = access_service.resolve(222)
    with pytest.raises(AccessDeniedError):
        service.record_analysis(context, dad.id, {"hemoglobin": 100.0}, "2026-07-01")


def test_general_recommendations_reflect_latest_known_values_not_just_current_message(
    service, access_service, mom
):
    context = access_service.resolve(222)
    service.record_analysis(context, mom.id, {"hemoglobin": 100.0}, "2026-07-01")

    # Второе сообщение вносит только глюкозу, но гемоглобин остаётся
    # последним известным отклонением — рекомендация должна сохраниться.
    result = service.record_analysis(context, mom.id, {"glucose": 5.0}, "2026-07-02")

    assert any(rule.id == "hb_low" for rule in result.general_recommendations)


def test_get_current_status_without_any_analyses_returns_empty_result(service, access_service, mom):
    context = access_service.resolve(222)
    result = service.get_current_status(context, mom.id)

    assert result.readings == []
    assert result.personal_rules == []
    assert result.general_recommendations == []


def test_get_current_status_reflects_last_saved_values(service, access_service, mom):
    context = access_service.resolve(222)
    service.record_analysis(context, mom.id, {"hemoglobin": 100.0}, "2026-07-01")

    result = service.get_current_status(context, mom.id)

    assert len(result.readings) == 1
    assert result.readings[0].norm_check.status == "low"
    assert any(rule.id == "hb_low" for rule in result.general_recommendations)


def test_get_current_status_includes_matching_personal_rule(
    service, access_service, mom, knowledge_base_service
):
    context = access_service.resolve(222)
    knowledge_base_service.add_rule(context, mom.id, "если гемоглобин низкий, помогает гранат")
    service.record_analysis(context, mom.id, {"hemoglobin": 100.0}, "2026-07-01")

    result = service.get_current_status(context, mom.id)

    assert len(result.personal_rules) == 1
    assert "гранат" in result.personal_rules[0].rule_text


def test_get_current_status_denies_access_to_someone_elses_data(service, access_service, dad, mom):
    context = access_service.resolve(222)
    with pytest.raises(AccessDeniedError):
        service.get_current_status(context, dad.id)


def test_record_analysis_uses_custom_norm_from_reference_sheet(service, access_service, mom, norms_repo):
    # Пользователь вписал в Справочник_Анализов свою норму гемоглобина (100-200) —
    # значение, которое по умолчанию считалось бы "low", должно стать "normal".
    norms_repo.catalog["hemoglobin"] = ("Гемоглобин", (100.0, 200.0), (100.0, 200.0))
    context = access_service.resolve(222)

    result = service.record_analysis(context, mom.id, {"hemoglobin": 125.0}, "2026-07-01")

    assert result.readings[0].norm_check.status == "normal"


def test_record_analysis_uses_personal_norm_for_child(service, access_service, mom, personal_norms_repo):
    # Персональная норма (например, детская) должна побеждать и общую
    # Справочник_Анализов, и встроенный дефолт из core/norms.py.
    personal_norms_repo.overrides_by_member[mom.id] = {"hemoglobin": (100.0, 200.0)}
    context = access_service.resolve(222)

    result = service.record_analysis(context, mom.id, {"hemoglobin": 125.0}, "2026-07-01")

    assert result.readings[0].norm_check.status == "normal"


def test_personal_norm_does_not_leak_to_other_family_members(
    service, access_service, mom, dad, personal_norms_repo
):
    personal_norms_repo.overrides_by_member[mom.id] = {"hemoglobin": (100.0, 200.0)}
    dad_context = access_service.resolve(111)

    result = service.record_analysis(dad_context, dad.id, {"hemoglobin": 125.0}, "2026-07-01")

    # У папы своей персональной нормы нет — используется общий дефолт (125 = low для male)
    assert result.readings[0].norm_check.status == "low"


def test_personal_norm_overrides_general_reference_sheet_norm(
    service, access_service, mom, norms_repo, personal_norms_repo
):
    norms_repo.catalog["hemoglobin"] = ("Гемоглобин", (90.0, 110.0), (90.0, 110.0))  # сделало бы 125 "high"
    personal_norms_repo.overrides_by_member[mom.id] = {"hemoglobin": (100.0, 200.0)}  # 125 = normal
    context = access_service.resolve(222)

    result = service.record_analysis(context, mom.id, {"hemoglobin": 125.0}, "2026-07-01")

    assert result.readings[0].norm_check.status == "normal"


def test_parse_indicators_recognizes_custom_indicator_added_by_user(service, norms_repo):
    # Пользователь добавил "МНО" в Справочник_Анализов — показателя вообще
    # нет в core/norms.NORMS, но текст должен распознаваться по русскому названию.
    norms_repo.catalog["INR"] = ("МНО", None, None)

    indicators = service.parse_indicators("мно 1.4")

    assert indicators == {"INR": 1.4}


def test_record_analysis_saves_custom_indicator_without_norm_status(service, access_service, mom, norms_repo):
    norms_repo.catalog["INR"] = ("МНО", None, None)
    context = access_service.resolve(222)

    result = service.record_analysis(context, mom.id, {"INR": 1.4}, "2026-07-01")

    # Норма не задана — значение сохранено, но статуса нет (не ломается, просто не оценивается)
    assert result.readings[0].value == 1.4
    assert result.readings[0].norm_check is None


def test_record_analysis_checks_custom_indicator_against_its_own_norm(service, access_service, mom, norms_repo):
    norms_repo.catalog["INR"] = ("МНО", (0.8, 1.2), (0.8, 1.2))
    context = access_service.resolve(222)

    result = service.record_analysis(context, mom.id, {"INR": 1.4}, "2026-07-01")

    assert result.readings[0].norm_check.status == "high"

