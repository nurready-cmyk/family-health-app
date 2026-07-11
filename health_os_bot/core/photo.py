"""Оркестрация обработки фото анализа: загрузка в Google Drive + саммари
через GPT-4o. Ничего не сохраняет в Medical_Data — это делает
handlers/photo.py через уже существующий MedicalDataService, и только после
подтверждения пользователем (принцип подтверждения, см. PRD.md раздел 6.6).
"""

from dataclasses import dataclass

from services.interfaces import ImageSummaryService, PhotoUploadService
from services.models import ExtractedMedicalSummary


@dataclass(frozen=True)
class PhotoProcessingResult:
    """Ссылка на загруженный скан и предложенное саммари, ожидающие подтверждения."""

    document_url: str
    extracted_summary: ExtractedMedicalSummary


class PhotoLogService:
    """Превращает фото в загруженный документ + предложенное саммари."""

    def __init__(
        self,
        upload_service: PhotoUploadService,
        summary_service: ImageSummaryService,
    ) -> None:
        self._upload_service = upload_service
        self._summary_service = summary_service

    def process(self, photo_bytes: bytes, filename: str, caption: str = "") -> PhotoProcessingResult:
        """Загрузить фото и сделать саммари. Может бросить ExtractionError —
        обработка на стороне handlers/photo.py."""
        document_url = self._upload_service.upload(photo_bytes, filename, "image/jpeg")
        extracted_summary = self._summary_service.summarize(photo_bytes, caption)
        return PhotoProcessingResult(document_url=document_url, extracted_summary=extracted_summary)

