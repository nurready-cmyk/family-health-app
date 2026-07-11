"""Абстрактные интерфейсы services/ — контракт, за которым спрятаны
конкретные провайдеры (faster-whisper, OpenAI). core/ и handlers/ знают
только эти интерфейсы, а не openai/faster_whisper напрямую — поэтому
переход на локальную LLM в будущем не потребует изменений вне services/.
"""

from abc import ABC, abstractmethod

from services.models import ExtractedMetric


class TranscriptionService(ABC):
    """Распознавание речи: аудиофайл -> текст."""

    @abstractmethod
    def transcribe(self, audio_file_path: str) -> str:
        """Вернуть текстовую расшифровку аудиофайла или бросить TranscriptionError."""


class MetricExtractionService(ABC):
    """Извлечение структурированной метрики из свободного текста."""

    @abstractmethod
    def extract_metric(self, transcript: str) -> ExtractedMetric:
        """Разобрать текст в ExtractedMetric или бросить ExtractionError."""

