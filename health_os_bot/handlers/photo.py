"""Обработка фото анализов: скачать -> загрузить в Google Drive -> саммари
через GPT-4o (vision) -> карточка подтверждения (Да/Исправить). В
Medical_Data ничего не пишется, пока пользователь не нажмёт «Да» —
принцип подтверждения из PRD.md, раздел 6.6.

Фото сбрасывает любой другой активный диалог, как и голосовое сообщение.
"""

import os
import tempfile
from datetime import date
from typing import Optional

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from core.access import AccessContext
from core.exceptions import AccessDeniedError
from core.medical_data import MedicalDataService
from core.photo import PhotoLogService
from handlers.keyboards import family_members_keyboard
from handlers.states import PhotoLogStates
from services.exceptions import ExtractionError, UploadError

router = Router(name="photo")


def _confirmation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Да, сохранить", callback_data="photo_confirm:yes"),
                InlineKeyboardButton(text="✏️ Исправить", callback_data="photo_confirm:no"),
            ]
        ]
    )


def _confirmation_text(event_type: str, summary: str, document_url: str) -> str:
    return (
        f"📋 Понял: {event_type}\n\n"
        f"{summary}\n\n"
        f"📎 Скан: {document_url}\n\n"
        f"Сохранить?"
    )


async def _show_confirmation(
    message: Message,
    state: FSMContext,
    family_member_id: str,
    event_type: str,
    summary: str,
    document_url: str,
) -> None:
    await state.update_data(
        family_member_id=family_member_id,
        event_type=event_type,
        summary=summary,
        document_url=document_url,
    )
    await message.edit_text(
        _confirmation_text(event_type, summary, document_url),
        reply_markup=_confirmation_keyboard(),
    )
    await state.set_state(PhotoLogStates.confirming)


@router.message(F.photo)
async def handle_photo_message(
    message: Message,
    access: Optional[AccessContext],
    state: FSMContext,
    photo_log_service: PhotoLogService,
) -> None:
    if access is None:
        await message.answer("Вы не зарегистрированы в Health OS.")
        return
    if not access.allowed_family_members:
        await message.answer("Нет доступных членов семьи для записи.")
        return

    await state.clear()  # фото отменяет любой другой диалог

    status_message = await message.answer("📸 Обрабатываю фото...")

    largest_photo = message.photo[-1]
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
        photo_path = tmp_file.name

    try:
        await message.bot.download(largest_photo, destination=photo_path)
        with open(photo_path, "rb") as photo_file:
            photo_bytes = photo_file.read()

        result = photo_log_service.process(
            photo_bytes,
            filename=f"scan_{largest_photo.file_unique_id}.jpg",
            caption=message.caption or "",
        )
    except UploadError as error:
        await status_message.edit_text(f"Не смог загрузить фото: {error}")
        return
    except ExtractionError:
        await status_message.edit_text(
            "Фото сохранено, но не смог сделать саммари. "
            "Введите данные вручную через /log."
        )
        return
    finally:
        os.remove(photo_path)

    if len(access.allowed_family_members) == 1:
        await _show_confirmation(
            status_message,
            state,
            access.allowed_family_members[0].id,
            result.extracted_summary.event_type,
            result.extracted_summary.summary,
            result.document_url,
        )
        return

    await state.update_data(
        event_type=result.extracted_summary.event_type,
        summary=result.extracted_summary.summary,
        document_url=result.document_url,
    )
    await status_message.edit_text("За кого этот скан?")
    await message.answer(
        "Выберите члена семьи:",
        reply_markup=family_members_keyboard(access.allowed_family_members),
    )
    await state.set_state(PhotoLogStates.choosing_family_member)


@router.callback_query(PhotoLogStates.choosing_family_member, F.data.startswith("family_member:"))
async def photo_family_member_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    family_member_id = callback.data.split(":", 1)[1]
    data = await state.get_data()
    await callback.answer()
    await _show_confirmation(
        callback.message,
        state,
        family_member_id,
        data["event_type"],
        data["summary"],
        data["document_url"],
    )


@router.callback_query(PhotoLogStates.confirming, F.data == "photo_confirm:yes")
async def photo_confirmed(
    callback: CallbackQuery,
    state: FSMContext,
    access: AccessContext,
    medical_data_service: MedicalDataService,
) -> None:
    data = await state.get_data()
    await callback.answer()

    try:
        medical_data_service.record_event(
            access=access,
            family_member_id=data["family_member_id"],
            event_type=data["event_type"],
            summary=data["summary"],
            document_url=data["document_url"],
            event_date=date.today().isoformat(),
        )
    except AccessDeniedError as error:
        await callback.message.edit_text(str(error))
        await state.clear()
        return

    await state.clear()
    await callback.message.edit_text("✅ Записано!")


@router.callback_query(PhotoLogStates.confirming, F.data == "photo_confirm:no")
async def photo_rejected(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    await callback.message.edit_text(
        "Хорошо, не сохраняю. Воспользуйтесь /log, чтобы ввести данные вручную."
    )

