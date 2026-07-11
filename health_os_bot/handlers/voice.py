"""Обработка голосовых сообщений: скачать -> транскрибировать (faster-whisper,
локально) -> извлечь метрику (GPT-4o-mini) -> показать карточку
подтверждения (Да/Исправить). В Logs ничего не пишется, пока пользователь не
нажмёт «Да» — принцип подтверждения из PRD.md, раздел 6.6.

Голосовое сообщение сбрасывает любой другой активный диалог (пользователь
явно переключился на новый способ ввода).
"""

import os
import tempfile
from typing import Optional

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from core.access import AccessContext
from core.exceptions import AccessDeniedError
from core.logs import LogService
from core.voice import VoiceLogService
from handlers.keyboards import METRIC_TYPE_LABELS, family_members_keyboard
from handlers.states import VoiceLogStates
from services.exceptions import ExtractionError, TranscriptionError

router = Router(name="voice")


def _confirmation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Да, сохранить", callback_data="voice_confirm:yes"),
                InlineKeyboardButton(text="✏️ Исправить", callback_data="voice_confirm:no"),
            ]
        ]
    )


def _confirmation_text(transcript: str, metric_type: str, value: str, notes: str) -> str:
    label = METRIC_TYPE_LABELS.get(metric_type, metric_type)
    notes_line = f"\n📝 {notes}" if notes else ""
    return (
        f"🎙️ Услышал: «{transcript}»\n\n"
        f"📋 Понял: {label} = {value}{notes_line}\n\n"
        f"Сохранить?"
    )


async def _show_confirmation(
    message: Message,
    state: FSMContext,
    family_member_id: str,
    transcript: str,
    metric_type: str,
    value: str,
    notes: str,
) -> None:
    """Сохранить всё нужное для сохранения в state и показать карточку Да/Исправить."""
    await state.update_data(
        family_member_id=family_member_id,
        metric_type=metric_type,
        value=value,
        notes=notes,
    )
    await message.edit_text(
        _confirmation_text(transcript, metric_type, value, notes),
        reply_markup=_confirmation_keyboard(),
    )
    await state.set_state(VoiceLogStates.confirming)


@router.message(F.voice)
async def handle_voice_message(
    message: Message,
    access: Optional[AccessContext],
    state: FSMContext,
    voice_log_service: VoiceLogService,
) -> None:
    if access is None:
        await message.answer("Вы не зарегистрированы в Health OS.")
        return
    if not access.allowed_family_members:
        await message.answer("Нет доступных членов семьи для записи.")
        return

    await state.clear()  # голосовое сообщение отменяет любой другой диалог

    status_message = await message.answer("🎙️ Распознаю голос...")

    with tempfile.NamedTemporaryFile(suffix=".oga", delete=False) as tmp_file:
        audio_path = tmp_file.name

    try:
        await message.bot.download(message.voice, destination=audio_path)
        result = voice_log_service.process(audio_path)
    except TranscriptionError as error:
        await status_message.edit_text(f"Не смог распознать голос: {error}")
        return
    except ExtractionError:
        await status_message.edit_text(
            "Распознал речь, но не понял, какая это метрика. "
            "Воспользуйтесь /log для ручного ввода."
        )
        return
    finally:
        os.remove(audio_path)

    if len(access.allowed_family_members) == 1:
        await _show_confirmation(
            status_message,
            state,
            access.allowed_family_members[0].id,
            result.transcript,
            result.extracted_metric.metric_type,
            result.extracted_metric.value,
            result.extracted_metric.notes,
        )
        return

    await state.update_data(
        metric_type=result.extracted_metric.metric_type,
        value=result.extracted_metric.value,
        notes=result.extracted_metric.notes,
        transcript=result.transcript,
    )
    await status_message.edit_text("За кого это сообщение?")
    await message.answer(
        "Выберите члена семьи:",
        reply_markup=family_members_keyboard(access.allowed_family_members),
    )
    await state.set_state(VoiceLogStates.choosing_family_member)


@router.callback_query(VoiceLogStates.choosing_family_member, F.data.startswith("family_member:"))
async def voice_family_member_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    family_member_id = callback.data.split(":", 1)[1]
    data = await state.get_data()
    await callback.answer()
    await _show_confirmation(
        callback.message,
        state,
        family_member_id,
        data["transcript"],
        data["metric_type"],
        data["value"],
        data["notes"],
    )


@router.callback_query(VoiceLogStates.confirming, F.data == "voice_confirm:yes")
async def voice_confirmed(
    callback: CallbackQuery,
    state: FSMContext,
    access: AccessContext,
    log_service: LogService,
) -> None:
    data = await state.get_data()
    await callback.answer()

    try:
        log_service.record_metric(
            access=access,
            family_member_id=data["family_member_id"],
            metric_type=data["metric_type"],
            value=data["value"],
            notes=data["notes"],
        )
    except AccessDeniedError as error:
        await callback.message.edit_text(str(error))
        await state.clear()
        return

    await state.clear()
    await callback.message.edit_text("✅ Записано!")


@router.callback_query(VoiceLogStates.confirming, F.data == "voice_confirm:no")
async def voice_rejected(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    await callback.message.edit_text(
        "Хорошо, не сохраняю. Воспользуйтесь /log, чтобы ввести данные вручную."
    )

