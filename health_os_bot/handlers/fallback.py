"""Обработчик «по умолчанию» — регистрируется последним в get_routers().

Ловит любое сообщение/нажатие кнопки, которые не подошли ни одному другому
роутеру (например, устаревшая инлайн-кнопка из прошлого диалога, или текст
не в том формате, который ждёт текущий шаг). Без этого бот в таких случаях
получает апдейт от Telegram, но молча ничего не отвечает — снаружи это
неотличимо от «бот не работает».
"""

from aiogram import Router
from aiogram.types import CallbackQuery, Message

router = Router(name="fallback")

_HELP_TEXT = (
    "Не понял 🙂 Доступные команды:\n"
    "/log — внести ежедневную метрику (энергия/сон/питание/тренировка)\n"
    "/analysis — внести показатели анализов\n"
    "/report — посмотреть текущий статус и рекомендации\n"
    "/add_rule — добавить личное правило\n"
    "/add_family_member — добавить члена семьи (только администратор)\n\n"
    "Либо просто отправьте голосовое сообщение или фото анализа."
)


@router.message()
async def fallback_message(message: Message) -> None:
    await message.answer(_HELP_TEXT)


@router.callback_query()
async def fallback_callback(callback: CallbackQuery) -> None:
    await callback.answer("Эта кнопка уже неактуальна — попробуйте команду заново.", show_alert=True)

