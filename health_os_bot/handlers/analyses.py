"""Ручной ввод показателей анализов и просмотр текущего статуса.

/analysis → кто → показатели → рекомендации (личные правила впереди общих).
/report   → кто → те же отклонения и рекомендации, но без нового ввода —
            по последним известным показателям (core.analyses.get_current_status).

Без LLM — тот же принцип "ручного" ввода, что и в /log (core/analyses.py
делает всю разборку и сборку рекомендаций, этот роутер только оркестрирует
диалог).
"""

from datetime import date
from typing import Optional

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from core.access import AccessContext
from core.analyses import AnalysisResult, AnalysisService, parse_analysis_text
from core.exceptions import AccessDeniedError
from core.norms import NORMS
from core.rules import Rule
from handlers.keyboards import family_members_keyboard
from handlers.states import AnalysisStates, ReportStates

router = Router(name="analyses")

_STATUS_LABELS = {"normal": "✅ норма", "low": "⬇️ ниже нормы", "high": "⬆️ выше нормы"}


@router.message(Command("analysis"))
async def start_analysis(
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
        await _prompt_indicators(message, state)
        return

    await message.answer(
        "За кого вносим анализы?",
        reply_markup=family_members_keyboard(access.allowed_family_members),
    )
    await state.set_state(AnalysisStates.choosing_family_member)


@router.callback_query(AnalysisStates.choosing_family_member, F.data.startswith("family_member:"))
async def analysis_family_member_chosen(callback: CallbackQuery, state: FSMContext) -> None:
    family_member_id = callback.data.split(":", 1)[1]
    await state.update_data(family_member_id=family_member_id)
    await callback.answer()
    await _prompt_indicators(callback.message, state)


async def _prompt_indicators(message: Message, state: FSMContext) -> None:
    await message.answer(
        "📊 Напишите показатели через запятую или каждый на новой строке.\n"
        "Например:\n<i>гемоглобин 135, глюкоза 5.2, давление 120/80</i>"
    )
    await state.set_state(AnalysisStates.entering_indicators)


@router.message(AnalysisStates.entering_indicators, F.text)
async def indicators_entered(
    message: Message,
    state: FSMContext,
    access: AccessContext,
    analysis_service: AnalysisService,
) -> None:
    indicators = parse_analysis_text(message.text)
    if not indicators:
        await message.answer("Не смог распознать показатели. Попробуйте формат: <i>гемоглобин 135</i>")
        return

    data = await state.get_data()

    try:
        result = analysis_service.record_analysis(
            access=access,
            family_member_id=data["family_member_id"],
            indicators=indicators,
            entry_date=date.today().isoformat(),
        )
    except AccessDeniedError as error:
        await message.answer(str(error))
        await state.clear()
        return

    await state.clear()
    await message.answer("📊 Записал:\n" + _format_readings(result) + _format_recommendations_block(result))


@router.message(Command("report"))
async def start_report(
    message: Message,
    access: Optional[AccessContext],
    state: FSMContext,
    analysis_service: AnalysisService,
) -> None:
    if access is None:
        await message.answer("Вы не зарегистрированы в Health OS.")
        return
    if not access.allowed_family_members:
        await message.answer("Нет доступных членов семьи.")
        return

    if len(access.allowed_family_members) == 1:
        await _send_report(message, access, access.allowed_family_members[0].id, analysis_service)
        return

    await message.answer(
        "За кого посмотреть отчёт?",
        reply_markup=family_members_keyboard(access.allowed_family_members),
    )
    await state.set_state(ReportStates.choosing_family_member)


@router.callback_query(ReportStates.choosing_family_member, F.data.startswith("family_member:"))
async def report_family_member_chosen(
    callback: CallbackQuery,
    state: FSMContext,
    access: AccessContext,
    analysis_service: AnalysisService,
) -> None:
    family_member_id = callback.data.split(":", 1)[1]
    await callback.answer()
    await state.clear()
    await _send_report(callback.message, access, family_member_id, analysis_service)


async def _send_report(
    message: Message, access: AccessContext, family_member_id: str, analysis_service: AnalysisService
) -> None:
    try:
        result = analysis_service.get_current_status(access, family_member_id)
    except AccessDeniedError as error:
        await message.answer(str(error))
        return

    if not result.readings:
        await message.answer("Нет сохранённых анализов. Введите через /analysis.")
        return

    await message.answer("📋 Текущие показатели:\n" + _format_readings(result) + _format_recommendations_block(result))


def _format_readings(result: AnalysisResult) -> str:
    lines = []
    for reading in result.readings:
        norm = NORMS.get(reading.indicator_key)
        label = norm.label if norm else reading.indicator_key
        unit = norm.unit if norm else ""
        status_label = _STATUS_LABELS.get(reading.norm_check.status, "") if reading.norm_check else ""
        lines.append(f"• {label}: <b>{reading.value}</b> {unit} — {status_label}")
    return "\n".join(lines)


def _format_recommendations_block(result: AnalysisResult) -> str:
    block = ""
    if result.personal_rules:
        block += "\n\n🧠 Из ваших личных заметок:\n" + "\n".join(
            f"• {rule.rule_text}" for rule in result.personal_rules
        )
    if result.general_recommendations:
        block += "\n\n💡 Рекомендации:\n" + "\n\n".join(
            _format_recommendation(rule) for rule in result.general_recommendations
        )
    return block


def _format_recommendation(rule: Rule) -> str:
    return (
        f"{rule.title}\n{rule.problem}\n"
        f"Есть: {', '.join(rule.eat)}\n"
        f"Исключить: {', '.join(rule.avoid)}\n"
        f"Спорт: {rule.workout}"
    )

