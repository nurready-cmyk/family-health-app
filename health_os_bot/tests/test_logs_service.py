"""core/logs.py: запись метрики с проверкой прав."""

import pytest

from core.exceptions import AccessDeniedError
from core.logs import LogService


@pytest.fixture
def service(logs_repo) -> LogService:
    return LogService(logs_repo)


def test_admin_can_record_metric_for_anyone(service, access_service, dad, mom):
    admin_context = access_service.resolve(111)
    entry = service.record_metric(admin_context, mom.id, "energy", "8", "")
    assert entry.family_member_id == mom.id
    assert entry.metric_type == "energy"


def test_user_can_record_metric_for_self(service, access_service, dad, mom):
    user_context = access_service.resolve(222)
    entry = service.record_metric(user_context, mom.id, "sleep", "7.5", "легла рано")
    assert entry.value == "7.5"


def test_user_cannot_record_metric_for_someone_else(service, access_service, dad, mom):
    user_context = access_service.resolve(222)
    with pytest.raises(AccessDeniedError):
        service.record_metric(user_context, dad.id, "energy", "8", "")

