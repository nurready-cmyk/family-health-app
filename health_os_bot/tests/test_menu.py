"""handlers/keyboards.py: главное меню и убранная кнопка «Энергия».

Плюс проверка, что кнопки меню приводят к тем же сценариям, что и
одноимённые slash-команды (/log, /analysis, /report, /add_rule).
"""

from conftest import make_message_update

from core.analyses import AnalysisService
from core.knowledge_base import KnowledgeBaseService
from core.logs import LogService
from handlers.keyboards import METRIC_TYPE_LABELS, metric_type_keyboard


def test_energy_button_removed_from_manual_log_keyboard_but_label_still_known():
    # Кнопки для ручного /log больше нет (по просьбе пользователя), но
    # подпись остаётся в словаре — нужна для карточки голосового ввода,
    # если GPT распознает "энергия" из речи, хотя кнопки для неё нет.
    assert "energy" in METRIC_TYPE_LABELS

    keyboard = metric_type_keyboard()
    all_button_texts = [button.text for row in keyboard.inline_keyboard for button in row]
    assert not any("Энергия" in text for text in all_button_texts)
    assert len(all_button_texts) == 3  # Сон, Питание, Тренировка


async def test_log_menu_button_starts_log_flow(make_dispatcher, bot, bot_session, mom, logs_repo):
    dispatcher = make_dispatcher(log_service=LogService(logs_repo))

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="📝 Дневник"))

    assert any("Какая метрика?" in text for text in bot_session.sent_texts)


async def test_analysis_menu_button_starts_analysis_flow(
    make_dispatcher, bot, bot_session, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service = KnowledgeBaseService(knowledge_base_repo)
    analysis_service = AnalysisService(analyses_repo, knowledge_base_service)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="📊 Анализы"))

    assert any("На какую дату" in text for text in bot_session.sent_texts)


async def test_report_menu_button_starts_report_flow(
    make_dispatcher, bot, bot_session, mom, analyses_repo, knowledge_base_repo
):
    knowledge_base_service = KnowledgeBaseService(knowledge_base_repo)
    analysis_service = AnalysisService(analyses_repo, knowledge_base_service)
    dispatcher = make_dispatcher(analysis_service=analysis_service, knowledge_base_service=knowledge_base_service)

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="📈 Отчёт"))

    assert any("Нет сохранённых анализов" in text for text in bot_session.sent_texts)


async def test_add_rule_menu_button_starts_add_rule_flow(
    make_dispatcher, bot, bot_session, mom, knowledge_base_repo
):
    dispatcher = make_dispatcher(knowledge_base_service=KnowledgeBaseService(knowledge_base_repo))

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="🧠 Моё правило"))

    assert any("Опишите личное правило" in text for text in bot_session.sent_texts)
