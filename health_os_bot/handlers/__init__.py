"""Сборка роутеров для всех обработчиков Telegram-апдейтов.

Каждый новый роутер (анализы, тренировки, питание, фото и т.д.)
добавляется в своём модуле, а затем — в список ниже. bot.py эту функцию не
меняет при добавлении нового модуля.
"""

from aiogram import Router

from handlers import logs, registration, voice


def get_routers() -> list[Router]:
    """Вернуть все роутеры, которые нужно зарегистрировать на Dispatcher."""
    return [registration.router, logs.router, voice.router]

