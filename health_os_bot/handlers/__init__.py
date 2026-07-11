"""Router aggregation for all Telegram update handlers.

Individual routers (analyses, workouts, nutrition, voice, photo, etc.) are
added here as they are implemented in their own modules, then exposed
through get_routers() so bot.py never has to change when a new handler
module is introduced.
"""

from aiogram import Router


def get_routers() -> list[Router]:
    """Return every router that should be registered on the Dispatcher."""
    return []

