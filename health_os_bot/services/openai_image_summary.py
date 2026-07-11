"""Саммари скана анализа/заключения через GPT-4o (vision).

Платный запрос — дороже, чем gpt-4o-mini для текста, но осознанно принято
(см. health_os_bot/PRD.md, раздел 7). Фото передаётся моделью как base64
data URI — не нужно ждать, пока свежезагруженная ссылка на Drive станет
доступна извне.
"""

import base64
import json

from openai import OpenAI, OpenAIError

from services.exceptions import ExtractionError
from services.interfaces import ImageSummaryService
from services.models import ExtractedMedicalSummary

_SYSTEM_PROMPT = (
    "Ты медицинский ассистент, который делает саммари скана анализа или "
    "врачебного заключения по фото. Определи event_type (например: "
    '"общий анализ крови", "УЗИ", "приём врача") и summary — краткое '
    "саммари на русском, обязательно отметь показатели с отклонением от "
    "нормы, если они видны. Ответь строго JSON без пояснений: "
    '{"event_type": "...", "summary": "..."}'
)


class OpenAIImageSummaryService(ImageSummaryService):
    def __init__(self, api_key: str, model: str = "gpt-4o") -> None:
        self._client = OpenAI(api_key=api_key)
        self._model = model

    def summarize(self, image_bytes: bytes, caption: str = "") -> ExtractedMedicalSummary:
        image_data_url = "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
        user_content = [{"type": "image_url", "image_url": {"url": image_data_url}}]
        if caption:
            user_content.append({"type": "text", "text": caption})

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
            )
        except OpenAIError as error:
            raise ExtractionError(f"Ошибка обращения к OpenAI: {error}") from error

        raw_content = response.choices[0].message.content
        return self._parse_response(raw_content)

    @staticmethod
    def _parse_response(raw_content: str) -> ExtractedMedicalSummary:
        try:
            parsed = json.loads(raw_content)
            event_type = str(parsed["event_type"])
            summary = str(parsed["summary"])
        except (json.JSONDecodeError, KeyError, TypeError) as error:
            raise ExtractionError(
                f"Модель вернула некорректный JSON: {raw_content!r}"
            ) from error

        if not event_type.strip() or not summary.strip():
            raise ExtractionError("Модель вернула пустой event_type или summary")

        return ExtractedMedicalSummary(event_type=event_type, summary=summary)

