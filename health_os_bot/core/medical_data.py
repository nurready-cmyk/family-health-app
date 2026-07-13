"""Запись медицинских событий (анализы, обследования, приёмы врачей).

Аналог core/logs.py, но для листа Medical_Data. Та же проверка прав перед
сохранением — LogService и MedicalDataService намеренно не объединены в один
класс, т.к. это разные сущности с разным набором полей.
"""

from core.access import AccessContext
from core.exceptions import AccessDeniedError
from database.interfaces import MedicalDataRepository
from database.models import MedicalRecord


class MedicalDataService:
    """Бизнес-логика записи медицинских событий — с проверкой прав перед сохранением."""

    def __init__(self, medical_data_repository: MedicalDataRepository) -> None:
        self._medical_data_repository = medical_data_repository

    def record_event(
        self,
        access: AccessContext,
        family_member_id: str,
        event_type: str,
        summary: str,
        document_url: str,
        event_date: str,
    ) -> MedicalRecord:
        """Сохранить одно медицинское событие на указанную дату, если у access
        есть на это право. Дата передаётся вызывающим кодом (а не всегда
        "сегодня"), чтобы можно было заносить обследования прошлых лет для
        истории — та же логика, что и в AnalysisService.record_analysis.
        """
        if not access.can_act_for(family_member_id):
            raise AccessDeniedError("Нет прав вносить данные за этого члена семьи")

        return self._medical_data_repository.add(
            record_date=event_date,
            family_member_id=family_member_id,
            event_type=event_type,
            summary=summary,
            document_url=document_url,
        )
