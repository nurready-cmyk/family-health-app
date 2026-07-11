"""handlers/photo.py: фото -> Drive + саммари -> карточка Да/Исправить.

PhotoLogService подменяется фейком со сценарием ответов — реальные
Google Drive/GPT-4o здесь не используются и не нужны.
"""

from conftest import make_callback_update, make_message_update

from core.medical_data import MedicalDataService
from core.photo import PhotoLogService, PhotoProcessingResult
from services.exceptions import ExtractionError, UploadError
from services.models import ExtractedMedicalSummary


class FakePhotoLogService(PhotoLogService):
    def __init__(self, script):
        self._script = list(script)

    def process(self, photo_bytes, filename, caption=""):
        outcome = self._script.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


async def test_single_family_member_confirms_and_saves(make_dispatcher, bot, bot_session, mom, medical_data_repo):
    fake_photo = FakePhotoLogService([
        PhotoProcessingResult(
            document_url="https://drive.example/scan",
            extracted_summary=ExtractedMedicalSummary(
                event_type="Общий анализ крови", summary="Гемоглобин снижен"
            ),
        )
    ])
    dispatcher = make_dispatcher(
        medical_data_service=MedicalDataService(medical_data_repo), photo_log_service=fake_photo
    )

    await dispatcher.feed_update(bot, make_message_update(222, 1, photo=True))
    assert any("Общий анализ крови" in text for text in bot_session.edited_texts)

    await dispatcher.feed_raw_update(bot, make_callback_update(222, 2, "photo_confirm:yes"))

    records = medical_data_repo.get_by_family_member_id(mom.id)
    assert len(records) == 1
    assert records[0].document_url == "https://drive.example/scan"


async def test_reject_with_ispravit_does_not_save(make_dispatcher, bot, bot_session, mom, medical_data_repo):
    fake_photo = FakePhotoLogService([
        PhotoProcessingResult(
            document_url="https://drive.example/scan",
            extracted_summary=ExtractedMedicalSummary(event_type="УЗИ", summary="Без отклонений"),
        )
    ])
    dispatcher = make_dispatcher(
        medical_data_service=MedicalDataService(medical_data_repo), photo_log_service=fake_photo
    )

    await dispatcher.feed_update(bot, make_message_update(222, 1, photo=True))
    await dispatcher.feed_raw_update(bot, make_callback_update(222, 2, "photo_confirm:no"))

    assert medical_data_repo.get_by_family_member_id(mom.id) == []


async def test_upload_error_is_reported_to_user(make_dispatcher, bot, bot_session, mom, medical_data_repo):
    fake_photo = FakePhotoLogService([UploadError("нет прав на папку")])
    dispatcher = make_dispatcher(
        medical_data_service=MedicalDataService(medical_data_repo), photo_log_service=fake_photo
    )

    await dispatcher.feed_update(bot, make_message_update(222, 1, photo=True))

    assert any("Не смог загрузить фото" in text for text in bot_session.edited_texts)


async def test_extraction_error_is_reported_to_user(make_dispatcher, bot, bot_session, mom, medical_data_repo):
    fake_photo = FakePhotoLogService([ExtractionError("модель не поняла фото")])
    dispatcher = make_dispatcher(
        medical_data_service=MedicalDataService(medical_data_repo), photo_log_service=fake_photo
    )

    await dispatcher.feed_update(bot, make_message_update(222, 1, photo=True))

    assert any("не смог сделать саммари" in text for text in bot_session.edited_texts)

