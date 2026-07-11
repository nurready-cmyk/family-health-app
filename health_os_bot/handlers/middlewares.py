"""Middleware, определяющий права доступа для каждого входящего события.

Регистрируется один раз в bot.py на message- и callback_query-роутерах.
После него в data хендлера всегда есть ключ "access" — AccessContext или
None, если tg_id не найден в Users.

AccessService приходит из data["access_service"] (внедряется в bot.py через
dispatcher["access_service"] = ...), а не через конструктор — тот же
единообразный DI-механизм workflow_data, что и для остальных сервисов.
Помимо единообразия, это даёт middleware без внутреннего состояния, которое
проще переиспользовать между тестами с разными фейковыми AccessService.
"""

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject


class AccessMiddleware(BaseMiddleware):
    """Прикладывает AccessContext к data['access'] на основе from_user события."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        telegram_user = getattr(event, "from_user", None)
        access_service = data["access_service"]
        data["access"] = access_service.resolve(telegram_user.id) if telegram_user is not None else None
        return await handler(event, data)

