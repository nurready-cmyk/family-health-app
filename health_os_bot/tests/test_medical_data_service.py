"""core/medical_data.py: запись медицинского события с проверкой прав."""

import pytest

from core.exceptions import AccessDeniedError
from core.medical_data import MedicalDataService


@pytest.fixture
def service(medical_data_repo) -> MedicalDataService:
    return MedicalDataService(medical_data_repo)


def test_admin_can_record_event_for_anyone(service, access_service, dad, mom):
    admin_context = access_service.resolve(111)
    record = service.record_event(
        admin_context,
        mom.id,
        "Общий анализ крови",
        "Всё в норме",
        "https://drive.example/scan",
        event_date="2026-07-01",
    )
    assert record.family_member_id == mom.id
    assert record.document_url == "https://drive.example/scan"


def test_record_event_stores_the_given_date_not_today(service, access_service, mom):
    context = access_service.resolve(222)
    record = service.record_event(
        context, mom.id, "УЗИ", "Без отклонений", "", event_date="2024-07-15"
    )
    assert record.date == "2024-07-15"


def test_user_cannot_record_event_for_someone_else(service, access_service, dad, mom):
    user_context = access_service.resolve(222)
    with pytest.raises(AccessDeniedError):
        service.record_event(user_context, dad.id, "УЗИ", "Без отклонений", "", event_date="2026-07-01")
