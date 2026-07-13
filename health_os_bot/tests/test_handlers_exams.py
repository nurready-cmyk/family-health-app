"""handlers/exams.py: /exam — обследование/приём врача текстом, без фото.

Ключевой сценарий из живого использования: должна работать и историческая
дата (не только "сегодня"), как и в /analysis.
"""

from conftest import make_callback_update, make_message_update

from core.medical_data import MedicalDataService


async def test_single_family_member_records_exam_with_historical_date(
    make_dispatcher, bot, bot_session, mom, medical_data_repo
):
    dispatcher = make_dispatcher(medical_data_service=MedicalDataService(medical_data_repo))

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/exam"))
    assert any("На какую дату" in text for text in bot_session.sent_texts)

    await dispatcher.feed_update(bot, make_message_update(222, 2, text="15.07.2024"))
    assert any("Что это было" in text for text in bot_session.sent_texts)

    await dispatcher.feed_update(bot, make_message_update(222, 3, text="УЗИ брюшной полости"))
    assert any("результат" in text for text in bot_session.sent_texts)

    await dispatcher.feed_update(bot, make_message_update(222, 4, text="Без отклонений"))

    records = medical_data_repo.get_by_family_member_id(mom.id)
    assert len(records) == 1
    assert records[0].date == "2024-07-15"
    assert records[0].event_type == "УЗИ брюшной полости"
    assert records[0].summary == "Без отклонений"
    assert records[0].document_url == ""


async def test_admin_records_exam_for_wife_via_menu_button(
    make_dispatcher, bot, bot_session, dad, mom, medical_data_repo
):
    dispatcher = make_dispatcher(medical_data_service=MedicalDataService(medical_data_repo))

    await dispatcher.feed_update(bot, make_message_update(111, 1, text="🩺 Обследования"))
    assert any("За кого" in text for text in bot_session.sent_texts)

    await dispatcher.feed_raw_update(bot, make_callback_update(111, 2, f"family_member:{mom.id}"))
    await dispatcher.feed_update(bot, make_message_update(111, 3, text="сегодня"))
    await dispatcher.feed_update(bot, make_message_update(111, 4, text="Приём кардиолога"))
    await dispatcher.feed_update(bot, make_message_update(111, 5, text="Давление в норме"))

    assert len(medical_data_repo.get_by_family_member_id(mom.id)) == 1
    assert medical_data_repo.get_by_family_member_id(dad.id) == []


async def test_exam_rejects_unparseable_date(make_dispatcher, bot, bot_session, mom, medical_data_repo):
    dispatcher = make_dispatcher(medical_data_service=MedicalDataService(medical_data_repo))

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/exam"))
    await dispatcher.feed_update(bot, make_message_update(222, 2, text="непонятно когда"))

    assert any("Не понял дату" in text for text in bot_session.sent_texts)
    assert medical_data_repo.get_by_family_member_id(mom.id) == []
