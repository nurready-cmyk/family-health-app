"""Типы данных, которыми services/ обменивается с core/.

Не путать с database/models.py — это не сущности БД, а промежуточный
результат работы AI-провайдера, ещё не сохранённый и не подтверждённый
пользователем.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ExtractedMetric:
    """Результат извлечения метрики моделью текста (GPT-4o-mini)."""

    metric_type: str
    value: str
    notes: str


@dataclass(frozen=True)
class ExtractedMedicalSummary:
    """Результат саммари скана анализа моделью изображений (GPT-4o)."""

    event_type: str
    summary: str

