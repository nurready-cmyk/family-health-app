"""Регистрация: первый администратор (bootstrap) и добавление членов семьи.

/start            — идентификация; если это самый первый admin из .env —
                     запускает диалог его регистрации.
/add_family_member — доступно только admin, добавляет нового члена семьи
                     (и, при наличии Telegram, отдельную учётную запись Users).
"""

from typing import Optional

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from config import Config
from core.access import AccessContext
from core.exceptions import AccessDeniedError
from core.family_members import FamilyMemberService
from database.models import Role
from handlers.keyboards import gender_keyboard
from handlers.states import AddFamilyMemberStates, BootstrapAdminStates

router = Router(name="registration")


def _parse_birth_year(raw_text: str) -> Optional[int]:
    text = raw_text.strip()
    if text.isdigit() and 1900 <= int(text) <= 2100:
        return int(text)
    return None


@router.message(CommandStart())
async def handle_start(
    message: Message,
    access: Optional[AccessContext],
    config: Config,
    state: FSMContext,
) -> None:
    if access is not None:
        role_label = "администратор" if access.user.role == Role.ADMIN.value else "участник семьи"
        await message.answer(f"С возвращением, {access.user.name}! Вы вошли как {role_label}.")
        return

    if message.from_user is None or message.from_user.id not in config.bootstrap_admin_ids:
        await message.answer(
            "Вы не зарегистрированы в Health OS. Попросите администратора семьи добавить вас."
        )
        return

    await message.answer("👋 Вы первый администратор Health OS. Как вас зовут?")
    await state.set_state(BootstrapAdminStates.waiting_for_name)


@router.message(BootstrapAdminStates.waiting_for_name, F.text)
async def bootstrap_name_entered(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text.strip())
    await message.answer("Укажите пол:", reply_markup=gender_keyboard())
    await state.set_state(BootstrapAdminStates.waiting_for_gender)


@router.callback_query(BootstrapAdminStates.waiting_for_gender, F.data.startswith("gender:"))
async def bootstrap_gender_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    gender = callback.data.split(":", 1)[1]
    await state.update_data(gender=gender)
    await callback.message.answer("Год рождения (например 1990)?")
    await callback.answer()
    await state.set_state(BootstrapAdminStates.waiting_for_birth_year)


@router.message(BootstrapAdminStates.waiting_for_birth_year, F.text)
async def bootstrap_birth_year_entered(
    message: Message,
    state: FSMContext,
    family_member_service: FamilyMemberService,
) -> None:
    birth_year = _parse_birth_year(message.text)
    if birth_year is None:
        await message.answer("Введите год рождения числом, например 1990.")
        return

    data = await state.get_data()
    family_member_service.register_bootstrap_admin(
        tg_id=message.from_user.id,
        name=data["name"],
        gender=data["gender"],
        birth_year=birth_year,
    )
    await state.clear()
    await message.answer(
        "Готово! Вы зарегистрированы как администратор.\n\n"
        "/add_family_member — добавить остальных членов семьи\n"
        "/log — внести данные о здоровье"
    )


@router.message(Command("add_family_member"))
async def start_add_family_member(
    message: Message,
    access: Optional[AccessContext],
    state: FSMContext,
) -> None:
    if access is None:
        await message.answer("Вы не зарегистрированы в Health OS.")
        return
    if access.user.role != Role.ADMIN.value:
        await message.answer("Добавлять членов семьи может только администратор.")
        return

    await message.answer("Как зовут нового члена семьи?")
    await state.set_state(AddFamilyMemberStates.waiting_for_name)


@router.message(AddFamilyMemberStates.waiting_for_name, F.text)
async def add_family_member_name_entered(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text.strip())
    await message.answer("Укажите пол:", reply_markup=gender_keyboard())
    await state.set_state(AddFamilyMemberStates.waiting_for_gender)


@router.callback_query(AddFamilyMemberStates.waiting_for_gender, F.data.startswith("gender:"))
async def add_family_member_gender_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    gender = callback.data.split(":", 1)[1]
    await state.update_data(gender=gender)
    await callback.message.answer("Год рождения?")
    await callback.answer()
    await state.set_state(AddFamilyMemberStates.waiting_for_birth_year)


@router.message(AddFamilyMemberStates.waiting_for_birth_year, F.text)
async def add_family_member_birth_year_entered(message: Message, state: FSMContext) -> None:
    birth_year = _parse_birth_year(message.text)
    if birth_year is None:
        await message.answer("Введите год рождения числом, например 2015.")
        return

    await state.update_data(birth_year=birth_year)
    await message.answer(
        "Есть ли у него/неё свой Telegram? Если да — пришлите числовой Telegram ID.\n"
        "Если нет — отправьте «нет»."
    )
    await state.set_state(AddFamilyMemberStates.waiting_for_telegram_id)


@router.message(AddFamilyMemberStates.waiting_for_telegram_id, F.text)
async def add_family_member_telegram_id_entered(
    message: Message,
    state: FSMContext,
    access: AccessContext,
    family_member_service: FamilyMemberService,
) -> None:
    raw_answer = message.text.strip().lower()
    tg_id: Optional[int] = None
    if raw_answer not in {"нет", "не", "no", "-"}:
        if not raw_answer.isdigit():
            await message.answer("Пришлите числовой Telegram ID или напишите «нет».")
            return
        tg_id = int(raw_answer)

    data = await state.get_data()
    try:
        member = family_member_service.add_family_member(
            acting_user=access.user,
            name=data["name"],
            gender=data["gender"],
            birth_year=data["birth_year"],
            tg_id=tg_id,
        )
    except AccessDeniedError as error:
        await message.answer(str(error))
        await state.clear()
        return

    await state.clear()
    await message.answer(f"✅ Добавлен новый член семьи: {member.name}")

