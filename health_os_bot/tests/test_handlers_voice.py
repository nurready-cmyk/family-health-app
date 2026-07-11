"""handlers/voice.py: голос -> транскрипция/извлечение -> карточка Да/Исправить.

VoiceLogService подменяется фейком со сценарием ответов — реальные
faster-whisper/OpenAI здесь не используются и не нужны.
"""

from conftest import make_callback_update, make_message_update

from core.logs import LogService
from core.voice import VoiceLogService, VoiceProcessingResult
from services.exceptions import ExtractionError, TranscriptionError
from services.models import ExtractedMetric


class FakeVoiceLogService(VoiceLogService):
    def __init__(self, script):
        self._script = list(script)  # без super().__init__ — реальные сервисы не нужны

    def process(self, audio_file_path: str) -> VoiceProcessingResult:
        outcome = self._script.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


async def test_single_family_member_confirms_and_saves(make_dispatcher, bot, bot_session, mom, logs_repo):
    fake_voice = FakeVoiceLogService([
        VoiceProcessingResult(
            transcript="энергия на восьмерку",
            extracted_metric=ExtractedMetric(metric_type="energy", value="8", notes=""),
        )
    ])
    dispatcher = make_dispatcher(log_service=LogService(logs_repo), voice_log_service=fake_voice)

    await dispatcher.feed_update(bot, make_message_update(222, 1, voice=True))
    assert any("Понял: ⚡ Энергия = 8" in text for text in bot_session.edited_texts)

    await dispatcher.feed_raw_update(bot, make_callback_update(222, 2, "voice_confirm:yes"))

    entries = logs_repo.get_by_family_member_id(mom.id)
    assert len(entries) == 1 and entries[0].metric_type == "energy"


async def test_reject_with_ispravit_does_not_save(make_dispatcher, bot, bot_session, mom, logs_repo):
    fake_voice = FakeVoiceLogService([
        VoiceProcessingResult(
            transcript="сон 7 часов",
            extracted_metric=ExtractedMetric(metric_type="sleep", value="7", notes=""),
        )
    ])
    dispatcher = make_dispatcher(log_service=LogService(logs_repo), voice_log_service=fake_voice)

    await dispatcher.feed_update(bot, make_message_update(222, 1, voice=True))
    await dispatcher.feed_raw_update(bot, make_callback_update(222, 2, "voice_confirm:no"))

    assert logs_repo.get_by_family_member_id(mom.id) == []


async def test_admin_picks_family_member_before_confirming(
    make_dispatcher, bot, bot_session, dad, mom, logs_repo
):
    fake_voice = FakeVoiceLogService([
        VoiceProcessingResult(
            transcript="сын спал 7 часов",
            extracted_metric=ExtractedMetric(metric_type="sleep", value="7", notes="сын"),
        )
    ])
    dispatcher = make_dispatcher(log_service=LogService(logs_repo), voice_log_service=fake_voice)

    await dispatcher.feed_update(bot, make_message_update(111, 1, voice=True))
    assert any("За кого" in text for text in bot_session.edited_texts)

    await dispatcher.feed_raw_update(bot, make_callback_update(111, 2, f"family_member:{dad.id}"))
    await dispatcher.feed_raw_update(bot, make_callback_update(111, 3, "voice_confirm:yes"))

    assert len(logs_repo.get_by_family_member_id(dad.id)) == 1
    assert logs_repo.get_by_family_member_id(mom.id) == []


async def test_transcription_error_is_reported_to_user(make_dispatcher, bot, bot_session, mom, logs_repo):
    fake_voice = FakeVoiceLogService([TranscriptionError("файл повреждён")])
    dispatcher = make_dispatcher(log_service=LogService(logs_repo), voice_log_service=fake_voice)

    await dispatcher.feed_update(bot, make_message_update(222, 1, voice=True))

    assert any("Не смог распознать голос" in text for text in bot_session.edited_texts)


async def test_extraction_error_is_reported_to_user(make_dispatcher, bot, bot_session, mom, logs_repo):
    fake_voice = FakeVoiceLogService([ExtractionError("не поняла")])
    dispatcher = make_dispatcher(log_service=LogService(logs_repo), voice_log_service=fake_voice)

    await dispatcher.feed_update(bot, make_message_update(222, 1, voice=True))

    assert any("не понял, какая это метрика" in text for text in bot_session.edited_texts)

