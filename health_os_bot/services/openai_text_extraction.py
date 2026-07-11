"""Извлечение структурированной метрики из текста через GPT-4o-mini.

Платный запрос (доли цента) — осознанно принято вместо полностью локального
решения (см. health_os_bot/PRD.md, раздел 7). Работает на любом тексте, а не
только на транскрипте голоса — это и есть "текстовый ввод через LLM",
описанный в PRD как возможное будущее для core/ обычных текстовых сообщений.
"""

import json

from openai import OpenAI, OpenAIError

from database.models import MetricType
from services.exceptions import ExtractionError
from services.interfaces import MetricExtractionService
from services.models import ExtractedMetric

_SYSTEM_PROMPT = (
    "Ты помощник, который извлекает из текста одну ежедневную метрику здоровья. "
    "Определи metric_type (строго один из: energy, sleep, food, workout), "
    "value (значение метрики строкой, например уровень энергии от 1 до 10 или "
    "часы сна) и notes (краткая заметка с дополнительным контекстом, или пустая "
    'строка). Ответь строго JSON без пояснений: {"metric_type": "...", '
    '"value": "...", "notes": "..."}'
)

_VALID_METRIC_TYPES = {member.value for member in MetricType}


class OpenAIMetricExtractionService(MetricExtractionService):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self._client = OpenAI(api_key=api_key)
        self._model = model

    def extract_metric(self, transcript: str) -> ExtractedMetric:
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": transcript},
                ],
            )
        except OpenAIError as error:
            raise ExtractionError(f"Ошибка обращения к OpenAI: {error}") from error

        raw_content = response.choices[0].message.content
        return self._parse_response(raw_content)

    @staticmethod
    def _parse_response(raw_content: str) -> ExtractedMetric:
        try:
            parsed = json.loads(raw_content)
            metric_type = str(parsed["metric_type"])
            value = str(parsed["value"])
            notes = str(parsed.get("notes", ""))
        except (json.JSONDecodeError, KeyError, TypeError) as error:
            raise ExtractionError(
                f"Модель вернула некорректный JSON: {raw_content!r}"
            ) from error

        if metric_type not in _VALID_METRIC_TYPES:
            raise ExtractionError(f"Неизвестный тип метрики от модели: {metric_type!r}")

        return ExtractedMetric(metric_type=metric_type, value=value, notes=notes)

