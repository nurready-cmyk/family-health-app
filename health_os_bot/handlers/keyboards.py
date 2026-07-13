"""Клавиатуры для диалогов handlers/: инлайн (внутри диалога) и главное
постоянное меню (видно всегда внизу чата, не привязано к состоянию FSM).
"""

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from database.models import FamilyMember, MetricType

# Подписи кнопок главного меню — совпадают с текстом, на который реагируют
# соответствующие роутеры (см. F.text == ... рядом с @router.message(Command(...))).
MENU_LOG = "📝 Дневник"
MENU_ANALYSIS = "📊 Анализы"
MENU_EXAM = "🩺 Обследования"
MENU_REPORT = "📈 Отчёт"
MENU_ADD_RULE = "🧠 Моё правило"


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Постоянное меню внизу чата — видно всегда, не зависит от текущего
    шага диалога. Позволяет вводить данные в любой момент без необходимости
    помнить команды.
    """
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=MENU_LOG), KeyboardButton(text=MENU_ANALYSIS)],
            [KeyboardButton(text=MENU_EXAM), KeyboardButton(text=MENU_REPORT)],
            [KeyboardButton(text=MENU_ADD_RULE)],
        ],
        resize_keyboard=True,
    )

# Полный словарь подписей — используется везде, где метрику нужно только
# ОТОБРАЗИТЬ (например, карточка подтверждения после голосового сообщения:
# GPT может распознать "энергия" из речи, даже если кнопки для неё нет).
METRIC_TYPE_LABELS: dict[str, str] = {
    MetricType.ENERGY.value: "⚡ Энергия",
    MetricType.SLEEP.value: "😴 Сон",
    MetricType.FOOD.value: "🍽️ Питание",
    MetricType.WORKOUT.value: "🏋️ Тренировка",
}

# Подмножество, которое реально предлагается кнопками в ручном /log —
# «Энергия» намеренно исключена по просьбе пользователя (не несёт важности).
_MANUAL_LOG_METRIC_TYPES = [
    MetricType.SLEEP.value,
    MetricType.FOOD.value,
    MetricType.WORKOUT.value,
]


def gender_keyboard() -> InlineKeyboardMarkup:
    """Клавиатура выбора пола (male/female) при регистрации."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Мужской", callback_data="gender:male"),
                InlineKeyboardButton(text="Женский", callback_data="gender:female"),
            ]
        ]
    )


def family_members_keyboard(members: list[FamilyMember]) -> InlineKeyboardMarkup:
    """Клавиатура выбора члена семьи (используется admin'ом)."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=member.name, callback_data=f"family_member:{member.id}")]
            for member in members
        ]
    )


def metric_type_keyboard() -> InlineKeyboardMarkup:
    """Клавиатура выбора типа метрики для ручного /log (без «Энергия»)."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=METRIC_TYPE_LABELS[value], callback_data=f"metric:{value}")]
            for value in _MANUAL_LOG_METRIC_TYPES
        ]
    )

