"""Ручной ввод ежедневных метрик (энергия, сон, питание, тренировки).

Никакого LLM здесь нет — пользователь сам выбирает показатель и вводит
значение через диалог в handlers/. Извлечение метрик из голоса/фото —
отдельная логика в services/ + core/ на следующем этапе.
"""

from datetime import date

from core.access import AccessContext
from core.exceptions import AccessDeniedError
from database.interfaces import LogsRepository
from database.models import LogEntry


class LogService:
    """Бизнес-логика записи метрик — с проверкой прав перед сохранением."""

    def __init__(self, logs_repository: LogsRepository) -> None:
        self._logs_repository = logs_repository

    def record_metric(
        self,
        access: AccessContext,
        family_member_id: str,
        metric_type: str,
        value: str,
        notes: str = "",
    ) -> LogEntry:
        """Сохранить одну метрику за сегодня, если у access есть на это право."""
        if not access.can_act_for(family_member_id):
            raise AccessDeniedError("Нет прав вносить данные за этого члена семьи")

        return self._logs_repository.add(
            entry_date=date.today().isoformat(),
            family_member_id=family_member_id,
            metric_type=metric_type,
            value=value,
            notes=notes,
        )

