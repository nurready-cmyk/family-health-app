"""Абстрактные интерфейсы services/ — контракт, за которым спрятаны
конкретные провайдеры (faster-whisper, OpenAI). core/ и handlers/ знают
только эти интерфейсы, а не openai/faster_whisper напрямую — поэтому
переход на локальную LLM в будущем не потребует изменений вне services/.
"""

from abc import ABC, abstractmethod

from services.models import ExtractedMedicalSummary, ExtractedMetric


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


class PhotoUploadService(ABC):
    """Загрузка файла (скана анализа) во внешнее постоянное хранилище."""

    @abstractmethod
    def upload(self, file_bytes: bytes, filename: str, mime_type: str) -> str:
        """Загрузить файл и вернуть ссылку на него (document_url)."""


class ImageSummaryService(ABC):
    """Саммари скана анализа/заключения по фото."""

    @abstractmethod
    def summarize(self, image_bytes: bytes, caption: str = "") -> ExtractedMedicalSummary:
        """Сделать саммари изображения или бросить ExtractionError."""

