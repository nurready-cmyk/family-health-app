"""core/knowledge_base.py: добавление личных правил и сопоставление по показателю."""

import pytest

from core.exceptions import AccessDeniedError
from core.knowledge_base import KnowledgeBaseService


@pytest.fixture
def service(knowledge_base_repo) -> KnowledgeBaseService:
    return KnowledgeBaseService(knowledge_base_repo)


def test_admin_can_add_rule_for_anyone(service, access_service, dad, mom):
    admin_context = access_service.resolve(111)
    rule = service.add_rule(admin_context, mom.id, "если гемоглобин низкий, есть больше гречки")
    assert rule.family_member_id == mom.id


def test_user_cannot_add_rule_for_someone_else(service, access_service, dad, mom):
    user_context = access_service.resolve(222)
    with pytest.raises(AccessDeniedError):
        service.add_rule(user_context, dad.id, "если что-то, то что-то")


def test_matching_rules_found_by_indicator_label(service, access_service, mom):
    user_context = access_service.resolve(222)
    service.add_rule(user_context, mom.id, "если гемоглобин низкий, помогает гранат")
    service.add_rule(user_context, mom.id, "про сон вообще ничего")

    matching = service.get_matching_rules(mom.id, ["hemoglobin"])
    assert len(matching) == 1
    assert "гранат" in matching[0].rule_text


def test_no_matching_rules_when_no_triggered_indicators(service, access_service, mom):
    user_context = access_service.resolve(222)
    service.add_rule(user_context, mom.id, "если гемоглобин низкий, помогает гранат")

    assert service.get_matching_rules(mom.id, []) == []


def test_no_matching_rules_for_other_family_member(service, access_service, dad, mom):
    user_context = access_service.resolve(222)
    service.add_rule(user_context, mom.id, "если гемоглобин низкий, помогает гранат")

    assert service.get_matching_rules(dad.id, ["hemoglobin"]) == []

