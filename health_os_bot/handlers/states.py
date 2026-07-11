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

