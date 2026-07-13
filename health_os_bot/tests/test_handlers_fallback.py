"""handlers/fallback.py: бот никогда не должен молчать в ответ на апдейт.

Регрессия по факту живого использования: без fallback-роутера сообщение,
не подошедшее ни одному сценарию, доходило до бота (aiogram логировал его
как полученное), но ответа не было вообще — неотличимо от "бот не работает".
"""

from conftest import make_callback_update, make_message_update


async def test_unmatched_text_gets_a_reply_instead_of_silence(make_dispatcher, bot, bot_session, mom):
    dispatcher = make_dispatcher()

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="абракадабра непонятно что"))

    assert len(bot_session.sent_texts) == 1
    assert "Не понял" in bot_session.sent_texts[0]
    assert "/log" in bot_session.sent_texts[0]


async def test_unmatched_callback_gets_an_alert_instead_of_silence(make_dispatcher, bot, bot_session, mom):
    dispatcher = make_dispatcher()

    await dispatcher.feed_raw_update(bot, make_callback_update(222, 1, "stale_button:123"))

    # AnswerCallbackQuery не пишется в bot_session.sent_texts (это отдельный
    # метод) — проверяем через сырой лог запросов сессии.
    assert bot_session.last_answered_callback_text == "Эта кнопка уже неактуальна — попробуйте команду заново."
