"""handlers/analyses.py (/analysis) и handlers/knowledge_base.py (/add_rule).

Ключевой сценарий: личное правило проверяется раньше общей рекомендации.
"""

from conftest import FakeNormsRepository, FakePersonalNormsRepository, make_callback_update, make_message_update

from core.analyses import AnalysisService
from core.knowledge_base import KnowledgeBaseService


def _services(analyses_repo, knowledge_base_repo):
    knowledge_base_service = KnowledgeBaseService(knowledge_base_repo)
    analysis_service = AnalysisService(
        analyses_repo, knowledge_base_service, FakeNormsRepository(), FakePersonalNormsRepository()
    )
    return knowledge_base_service, analysis_service


async def test_admin_records_analysis_for_wife_and_gets_general_recommendation(
    make_dispatcher, bot, bot_session, dad, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service, analysis_service = _services(analyses_repo, knowledge_base_repo)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    await dispatcher.feed_update(bot, make_message_update(111, 1, text="/analysis"))
    assert any("За кого" in text for text in bot_session.sent_texts)

    await dispatcher.feed_raw_update(bot, make_callback_update(111, 2, f"family_member:{mom.id}"))
    await dispatcher.feed_update(bot, make_message_update(111, 3, text="сегодня"))
    await dispatcher.feed_update(bot, make_message_update(111, 4, text="гемоглобин 100"))

    combined = "\n".join(bot_session.sent_texts)
    assert "ниже нормы" in combined
    assert "Низкий гемоглобин" in combined
    assert len(analyses_repo.get_by_family_member_id(mom.id)) == 1


async def test_personal_rule_shown_before_general_recommendation(
    make_dispatcher, bot, bot_session, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service, analysis_service = _services(analyses_repo, knowledge_base_repo)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    # Жена сама добавляет личное правило
    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/add_rule"))
    await dispatcher.feed_update(
        bot, make_message_update(222, 2, text="если гемоглобин низкий, у меня лично помогает только гранат")
    )
    assert any("Запомнил" in text for text in bot_session.sent_texts)

    # Затем вносит анализ с тем же отклонением
    bot_session.sent_texts.clear()
    await dispatcher.feed_update(bot, make_message_update(222, 3, text="/analysis"))
    await dispatcher.feed_update(bot, make_message_update(222, 4, text="сегодня"))
    await dispatcher.feed_update(bot, make_message_update(222, 5, text="гемоглобин 95"))

    combined = "\n".join(bot_session.sent_texts)
    assert "Из ваших личных заметок" in combined
    assert "гранат" in combined
    personal_position = combined.index("Из ваших личных заметок")
    general_position = combined.index("💡 Рекомендации")
    assert personal_position < general_position


async def test_wife_cannot_add_rule_for_husband(
    make_dispatcher, bot, bot_session, dad, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service, analysis_service = _services(analyses_repo, knowledge_base_repo)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    # У жены только один allowed_family_member (она сама) — выбора нет,
    # /add_rule сразу просит текст правила для неё самой.
    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/add_rule"))
    assert any("Опишите личное правило" in text for text in bot_session.sent_texts)
    assert knowledge_base_repo.get_by_family_member_id(dad.id) == []


async def test_report_without_analyses_tells_user_to_use_analysis_command(
    make_dispatcher, bot, bot_session, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service, analysis_service = _services(analyses_repo, knowledge_base_repo)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/report"))

    assert any("Нет сохранённых анализов" in text for text in bot_session.sent_texts)


async def test_report_shows_current_deviation_without_new_input(
    make_dispatcher, bot, bot_session, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service, analysis_service = _services(analyses_repo, knowledge_base_repo)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/analysis"))
    await dispatcher.feed_update(bot, make_message_update(222, 2, text="сегодня"))
    await dispatcher.feed_update(bot, make_message_update(222, 3, text="гемоглобин 100"))

    bot_session.sent_texts.clear()
    await dispatcher.feed_update(bot, make_message_update(222, 4, text="/report"))

    combined = "\n".join(bot_session.sent_texts)
    assert "Текущие показатели" in combined
    assert "ниже нормы" in combined
    assert "Низкий гемоглобин" in combined
    # /report не должен создавать новую запись — только читает последние значения
    assert len(analyses_repo.get_by_family_member_id(mom.id)) == 1


async def test_analysis_with_historical_date_is_stored_with_that_date(
    make_dispatcher, bot, bot_session, mom, analyses_repo, knowledge_base_repo
):
    """Ключевой сценарий из живого использования: анализ, сданный год назад,
    должен сохраниться с указанной исторической датой, а не сегодняшней."""
    knowledge_base_service, analysis_service = _services(analyses_repo, knowledge_base_repo)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/analysis"))
    assert any("На какую дату" in text for text in bot_session.sent_texts)

    await dispatcher.feed_update(bot, make_message_update(222, 2, text="15.07.2024"))
    await dispatcher.feed_update(bot, make_message_update(222, 3, text="гемоглобин 130"))

    entries = analyses_repo.get_by_family_member_id(mom.id)
    assert len(entries) == 1
    assert entries[0].date == "2024-07-15"
    assert any("2024-07-15" in text for text in bot_session.sent_texts)


async def test_analysis_rejects_unparseable_date_and_asks_again(
    make_dispatcher, bot, bot_session, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service, analysis_service = _services(analyses_repo, knowledge_base_repo)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/analysis"))
    await dispatcher.feed_update(bot, make_message_update(222, 2, text="какая-то дата"))
    assert any("Не понял дату" in text for text in bot_session.sent_texts)

    # Показатели ещё не должны были сохраниться — мы всё ещё на шаге даты
    await dispatcher.feed_update(bot, make_message_update(222, 3, text="гемоглобин 130"))
    assert analyses_repo.get_by_family_member_id(mom.id) == []


async def test_admin_report_asks_which_family_member_first(
    make_dispatcher, bot, bot_session, dad, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service, analysis_service = _services(analyses_repo, knowledge_base_repo)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    await dispatcher.feed_update(bot, make_message_update(111, 1, text="/report"))
    assert any("За кого посмотреть отчёт?" in text for text in bot_session.sent_texts)

    bot_session.sent_texts.clear()
    await dispatcher.feed_raw_update(bot, make_callback_update(111, 2, f"family_member:{mom.id}"))
    assert any("Нет сохранённых анализов" in text for text in bot_session.sent_texts)

