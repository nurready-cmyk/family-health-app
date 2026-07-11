"""Состояния FSM для многошаговых диалогов бота."""

from aiogram.fsm.state import State, StatesGroup


class BootstrapAdminStates(StatesGroup):
    """Регистрация самого первого администратора (см. core/family_members.py)."""

    waiting_for_name = State()
    waiting_for_gender = State()
    waiting_for_birth_year = State()


class AddFamilyMemberStates(StatesGroup):
    """Диалог admin → «Добавить члена семьи»."""

    waiting_for_name = State()
    waiting_for_gender = State()
    waiting_for_birth_year = State()
    waiting_for_telegram_id = State()


class LogMetricStates(StatesGroup):
    """Диалог ручного ввода ежедневной метрики (/log)."""

    choosing_family_member = State()
    choosing_metric_type = State()
    entering_value = State()
    entering_notes = State()


class VoiceLogStates(StatesGroup):
    """Диалог после голосового сообщения: выбор члена семьи (если нужен)
    и подтверждение метрики, распознанной faster-whisper + GPT-4o-mini.
    """

    choosing_family_member = State()
    confirming = State()


class PhotoLogStates(StatesGroup):
    """Диалог после фото анализа: выбор члена семьи (если нужен) и
    подтверждение саммари, распознанного GPT-4o (vision).
    """

    choosing_family_member = State()
    confirming = State()


class AnalysisStates(StatesGroup):
    """Диалог ручного ввода показателей анализов (/analysis)."""

    choosing_family_member = State()
    entering_indicators = State()


class AddRuleStates(StatesGroup):
    """Диалог добавления личного правила (/add_rule)."""

    choosing_family_member = State()
    entering_rule_text = State()


class ReportStates(StatesGroup):
    """Диалог просмотра текущих отклонений и рекомендаций (/report)."""

    choosing_family_member = State()

