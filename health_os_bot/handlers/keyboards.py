"""Инлайн-клавиатуры для диалогов handlers/."""

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from database.models import FamilyMember, MetricType

METRIC_TYPE_LABELS: dict[str, str] = {
    MetricType.ENERGY.value: "⚡ Энергия",
    MetricType.SLEEP.value: "😴 Сон",
    MetricType.FOOD.value: "🍽️ Питание",
    MetricType.WORKOUT.value: "🏋️ Тренировка",
}


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
    """Клавиатура выбора типа метрики (energy/sleep/food/workout)."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=label, callback_data=f"metric:{value}")]
            for value, label in METRIC_TYPE_LABELS.items()
        ]
    )

