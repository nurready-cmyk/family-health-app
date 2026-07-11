"""Оркестрация обработки голосового сообщения: транскрипция -> извлечение
метрики. Ничего не сохраняет в Logs — это делает handlers/voice.py через уже
существующий LogService, и только после подтверждения пользователем
(принцип подтверждения, см. PRD.md раздел 6.6).
"""

from dataclasses import dataclass

from services.interfaces import MetricExtractionService, TranscriptionService
from services.models import ExtractedMetric


@dataclass(frozen=True)
class VoiceProcessingResult:
    """Транскрипт и предложенная метрика, ожидающие подтверждения пользователя."""

    transcript: str
    extracted_metric: ExtractedMetric


class VoiceLogService:
    """Превращает аудиофайл в предложенную метрику, готовую к подтверждению."""

    def __init__(
        self,
        transcription_service: TranscriptionService,
        metric_extraction_service: MetricExtractionService,
    ) -> None:
        self._transcription_service = transcription_service
        self._metric_extraction_service = metric_extraction_service

    def process(self, audio_file_path: str) -> VoiceProcessingResult:
        """Распознать речь и извлечь метрику. Может бросить TranscriptionError
        или ExtractionError — обработка на стороне handlers/voice.py."""
        transcript = self._transcription_service.transcribe(audio_file_path)
        extracted_metric = self._metric_extraction_service.extract_metric(transcript)
        return VoiceProcessingResult(transcript=transcript, extracted_metric=extracted_metric)

