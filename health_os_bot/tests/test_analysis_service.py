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
def service(analyses_repo, knowledge_base_service) -> AnalysisService:
    return AnalysisService(analyses_repo, knowledge_base_service)


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

