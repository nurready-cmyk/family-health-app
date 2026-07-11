"""Middleware, определяющий права доступа для каждого входящего события.

Регистрируется один раз в bot.py на message- и callback_query-роутерах.
После него в data хендлера всегда есть ключ "access" — AccessContext или
None, если tg_id не найден в Users.
"""

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from core.access import AccessService


class AccessMiddleware(BaseMiddleware):
    """Прикладывает AccessContext к data['access'] на основе from_user события."""

    def __init__(self, access_service: AccessService) -> None:
        self._access_service = access_service

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        telegram_user = getattr(event, "from_user", None)
        data["access"] = (
            self._access_service.resolve(telegram_user.id) if telegram_user is not None else None
        )
        return await handler(event, data)

