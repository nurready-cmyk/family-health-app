"""Сборка роутеров для всех обработчиков Telegram-апдейтов.

Каждый новый роутер (анализы, тренировки, питание и т.д.) добавляется в
своём модуле, а затем — в список ниже. bot.py эту функцию не меняет при
добавлении нового модуля.

fallback.router обязательно идёт последним — он ловит всё, что не подошло
другим роутерам, чтобы бот никогда не отвечал молчанием.
"""

from aiogram import Router

from handlers import analyses, fallback, knowledge_base, logs, photo, registration, voice


def get_routers() -> list[Router]:
    """Вернуть все роутеры, которые нужно зарегистрировать на Dispatcher."""
    return [
        registration.router,
        logs.router,
        voice.router,
        photo.router,
        analyses.router,
        knowledge_base.router,
        fallback.router,
    ]

