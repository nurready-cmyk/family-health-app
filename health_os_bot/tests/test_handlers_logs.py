"""handlers/logs.py: /log — ручной ввод ежедневных метрик."""

from conftest import make_callback_update, make_message_update

from core.logs import LogService
from services.exceptions import TranscriptionError


class _FailingVoiceLogService:
    """Голосовой сервис, который всегда падает с TranscriptionError — нужен
    только чтобы удовлетворить DI роутера handlers/voice.py в тесте ниже."""

    def process(self, audio_file_path: str):
        raise TranscriptionError("не используется в этом тесте")


async def test_user_with_single_family_member_skips_picker(make_dispatcher, bot, bot_session, mom, logs_repo):
    dispatcher = make_dispatcher(log_service=LogService(logs_repo))

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/log"))
    assert any("Какая метрика?" in text for text in bot_session.sent_texts)

    await dispatcher.feed_raw_update(bot, make_callback_update(222, 2, "metric:energy"))
    await dispatcher.feed_update(bot, make_message_update(222, 3, text="8"))
    await dispatcher.feed_update(bot, make_message_update(222, 4, text="-"))

    entries = logs_repo.get_by_family_member_id(mom.id)
    assert len(entries) == 1
    assert entries[0].metric_type == "energy" and entries[0].value == "8" and entries[0].notes == ""


async def test_admin_with_multiple_family_members_sees_picker(
    make_dispatcher, bot, bot_session, dad, mom, logs_repo
):
    dispatcher = make_dispatcher(log_service=LogService(logs_repo))

    await dispatcher.feed_update(bot, make_message_update(111, 1, text="/log"))
    assert any("За кого вносим данные?" in text for text in bot_session.sent_texts)

    await dispatcher.feed_raw_update(bot, make_callback_update(111, 2, f"family_member:{mom.id}"))
    await dispatcher.feed_raw_update(bot, make_callback_update(111, 3, "metric:sleep"))
    await dispatcher.feed_update(bot, make_message_update(111, 4, text="7.5"))
    await dispatcher.feed_update(bot, make_message_update(111, 5, text="легла рано"))

    entries = logs_repo.get_by_family_member_id(mom.id)
    assert len(entries) == 1
    assert entries[0].metric_type == "sleep" and entries[0].notes == "легла рано"
    assert logs_repo.get_by_family_member_id(dad.id) == []


async def test_voice_message_mid_dialog_does_not_crash_text_state_handler(
    make_dispatcher, bot, bot_session, mom, logs_repo
):
    """Регрессия: F.text-фильтр должен не дать голосовому сообщению попасть
    в обработчик, ожидающий текст (см. Этап 3 — исправление в handlers/logs.py)."""
    dispatcher = make_dispatcher(log_service=LogService(logs_repo), voice_log_service=_FailingVoiceLogService())

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/log"))
    await dispatcher.feed_raw_update(bot, make_callback_update(222, 2, "metric:energy"))
    # Голосовое вместо текста в состоянии entering_value — не должно упасть
    await dispatcher.feed_update(bot, make_message_update(222, 3, voice=True))

    assert logs_repo.get_by_family_member_id(mom.id) == []

