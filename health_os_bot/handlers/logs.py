"""Ручной ввод ежедневных метрик: /log → кто → что → значение → заметка.

Без LLM — пользователь сам выбирает всё кнопками или коротким текстом.
Автоматическое извлечение метрик из голоса появится в core/ на следующем
этапе (faster-whisper + GPT-4o-mini), этот роутер не изменится.
"""

from typing import Optional

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from core.access import AccessContext
from core.exceptions import AccessDeniedError
from core.logs import LogService
from handlers.keyboards import METRIC_TYPE_LABELS, family_members_keyboard, metric_type_keyboard
from handlers.states import LogMetricStates

router = Router(name="logs")


@router.message(Command("log"))
async def start_log(
    message: Message,
    access: Optional[AccessContext],
    state: FSMContext,
) -> None:
    if access is None:
        await message.answer("Вы не зарегистрированы в Health OS.")
        return
    if not access.allowed_family_members:
        await message.answer("Нет доступных членов семьи для записи.")
        return

    if len(access.allowed_family_members) == 1:
        await state.update_data(family_member_id=access.allowed_family_members[0].id)
        await message.answer("Какая метрика?", reply_markup=metric_type_keyboard())
        await state.set_state(LogMetricStates.choosing_metric_type)
        return

    await message.answer(
        "За кого вносим данные?",
        reply_markup=family_members_keyboard(access.allowed_family_members),
    )
    await state.set_state(LogMetricStates.choosing_family_member)


@router.callback_query(LogMetricStates.choosing_family_member, F.data.startswith("family_member:"))
async def family_member_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    family_member_id = callback.data.split(":", 1)[1]
    await state.update_data(family_member_id=family_member_id)
    await callback.message.answer("Какая метрика?", reply_markup=metric_type_keyboard())
    await callback.answer()
    await state.set_state(LogMetricStates.choosing_metric_type)


@router.callback_query(LogMetricStates.choosing_metric_type, F.data.startswith("metric:"))
async def metric_type_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    metric_type = callback.data.split(":", 1)[1]
    await state.update_data(metric_type=metric_type)
    label = METRIC_TYPE_LABELS.get(metric_type, metric_type)
    await callback.message.answer(f"{label} — введите значение:")
    await callback.answer()
    await state.set_state(LogMetricStates.entering_value)


@router.message(LogMetricStates.entering_value)
async def value_entered(message: Message, state: FSMContext) -> None:
    await state.update_data(value=message.text.strip())
    await message.answer("Заметка (или отправьте «-», если нет):")
    await state.set_state(LogMetricStates.entering_notes)


@router.message(LogMetricStates.entering_notes)
async def notes_entered(
    message: Message,
    state: FSMContext,
    access: AccessContext,
    log_service: LogService,
) -> None:
    notes = message.text.strip()
    if notes == "-":
        notes = ""

    data = await state.get_data()
    try:
        log_service.record_metric(
            access=access,
            family_member_id=data["family_member_id"],
            metric_type=data["metric_type"],
            value=data["value"],
            notes=notes,
        )
    except AccessDeniedError as error:
        await message.answer(str(error))
        await state.clear()
        return

    await state.clear()
    await message.answer("✅ Записано!")

