"""Обучение бота личным правилам: /add_rule → кто → текст правила.

Правило хранится одним свободным текстом (см. core/knowledge_base.py) и
проверяется раньше общих рекомендаций при вводе анализов (/analysis).
"""

from typing import Optional

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from core.access import AccessContext
from core.exceptions import AccessDeniedError
from core.knowledge_base import KnowledgeBaseService
from handlers.keyboards import MENU_ADD_RULE, family_members_keyboard
from handlers.states import AddRuleStates

router = Router(name="knowledge_base")


@router.message(Command("add_rule"))
@router.message(F.text == MENU_ADD_RULE)
async def start_add_rule(
    message: Message,
    access: Optional[AccessContext],
    state: FSMContext,
) -> None:
    if access is None:
        await message.answer("Вы не зарегистрированы в Health OS.")
        return
    if not access.allowed_family_members:
        await message.answer("Нет доступных членов семьи.")
        return

    if len(access.allowed_family_members) == 1:
        await state.update_data(family_member_id=access.allowed_family_members[0].id)
        await _prompt_rule_text(message, state)
        return

    await message.answer(
        "Для кого это правило?",
        reply_markup=family_members_keyboard(access.allowed_family_members),
    )
    await state.set_state(AddRuleStates.choosing_family_member)


@router.callback_query(AddRuleStates.choosing_family_member, F.data.startswith("family_member:"))
async def add_rule_family_member_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    family_member_id = callback.data.split(":", 1)[1]
    await state.update_data(family_member_id=family_member_id)
    await callback.answer()
    await _prompt_rule_text(callback.message, state)


async def _prompt_rule_text(message: Message, state: FSMContext) -> None:
    await message.answer(
        "🧠 Опишите личное правило свободным текстом, например:\n"
        "<i>если гемоглобин низкий, мне лично помогает больше гречки и меньше кофе</i>"
    )
    await state.set_state(AddRuleStates.entering_rule_text)


@router.message(AddRuleStates.entering_rule_text, F.text)
async def rule_text_entered(
    message: Message,
    state: FSMContext,
    access: AccessContext,
    knowledge_base_service: KnowledgeBaseService,
) -> None:
    data = await state.get_data()

    try:
        knowledge_base_service.add_rule(
            access=access,
            family_member_id=data["family_member_id"],
            rule_text=message.text.strip(),
        )
    except AccessDeniedError as error:
        await message.answer(str(error))
        await state.clear()
        return

    await state.clear()
    await message.answer("🧠 Запомнил! Буду учитывать это при отклонениях в анализах.")

