"""Добавление обследования/приёма врача текстом, без фото: /exam → кто →
дата → что за обследование → результат/заключение.

Для сканов используйте фото (handlers/photo.py) — тот путь автоматически
делает саммари через GPT-4o и сохраняет оригинал в Google Drive. Этот путь —
для случаев без скана: устный результат приёма, план лечения и т.п.
Поддерживает исторические даты (parse_flexible_date), как и /analysis.
"""

from typing import Optional

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from core.access import AccessContext
from core.analyses import parse_flexible_date
from core.exceptions import AccessDeniedError
from core.medical_data import MedicalDataService
from handlers.keyboards import MENU_EXAM, family_members_keyboard
from handlers.states import ExamStates

router = Router(name="exams")


@router.message(Command("exam"))
@router.message(F.text == MENU_EXAM)
async def start_exam(
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
        await _prompt_date(message, state)
        return

    await message.answer(
        "За кого это обследование?",
        reply_markup=family_members_keyboard(access.allowed_family_members),
    )
    await state.set_state(ExamStates.choosing_family_member)


@router.callback_query(ExamStates.choosing_family_member, F.data.startswith("family_member:"))
async def exam_family_member_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    family_member_id = callback.data.split(":", 1)[1]
    await state.update_data(family_member_id=family_member_id)
    await callback.answer()
    await _prompt_date(callback.message, state)


async def _prompt_date(message: Message, state: FSMContext) -> None:
    await message.answer(
        "На какую дату это обследование/приём?\n"
        "Напишите дату (например <i>15.07.2025</i>) или отправьте «сегодня»."
    )
    await state.set_state(ExamStates.entering_date)


@router.message(ExamStates.entering_date, F.text)
async def exam_date_entered(message: Message, state: FSMContext) -> None:
    entry_date = parse_flexible_date(message.text)
    if entry_date is None:
        await message.answer(
            "Не понял дату. Формат: <i>15.07.2025</i>, <i>2025-07-15</i> или «сегодня»."
        )
        return

    await state.update_data(entry_date=entry_date)
    await message.answer(
        "Что это было? Например: <i>УЗИ</i>, <i>приём кардиолога</i>, <i>рентген</i>."
    )
    await state.set_state(ExamStates.entering_event_type)


@router.message(ExamStates.entering_event_type, F.text)
async def exam_event_type_entered(message: Message, state: FSMContext) -> None:
    await state.update_data(event_type=message.text.strip())
    await message.answer("Что сказали / результат / заключение?")
    await state.set_state(ExamStates.entering_summary)


@router.message(ExamStates.entering_summary, F.text)
async def exam_summary_entered(
    message: Message,
    state: FSMContext,
    access: AccessContext,
    medical_data_service: MedicalDataService,
) -> None:
    data = await state.get_data()

    try:
        medical_data_service.record_event(
            access=access,
            family_member_id=data["family_member_id"],
            event_type=data["event_type"],
            summary=message.text.strip(),
            document_url="",
            event_date=data["entry_date"],
        )
    except AccessDeniedError as error:
        await message.answer(str(error))
        await state.clear()
        return

    await state.clear()
    await message.answer(f"✅ Записано ({data['entry_date']}): {data['event_type']}")
