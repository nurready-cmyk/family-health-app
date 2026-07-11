"""Точка входа Telegram-бота Health OS.

Этот файл только собирает всё воедино: конфиг, репозитории, сервисы core/ и
services/, Bot/Dispatcher, роутеры, polling. Никакой бизнес-логики, никакого
прямого обращения к Google Sheets или OpenAI здесь быть не должно.
"""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from config import load_config
from core.access import AccessService
from core.family_members import FamilyMemberService
from core.logs import LogService
from core.voice import VoiceLogService
from database import build_repositories
from handlers import get_routers
from handlers.middlewares import AccessMiddleware
from services.faster_whisper_transcription import FasterWhisperTranscriptionService
from services.openai_text_extraction import OpenAIMetricExtractionService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


async def main() -> None:
    """Собрать бота с зависимостями и запустить polling."""
    config = load_config()
    repositories = build_repositories(config.google_credentials_path, config.google_sheet_id)

    access_service = AccessService(repositories.users, repositories.family_members)
    family_member_service = FamilyMemberService(repositories.family_members, repositories.users)
    log_service = LogService(repositories.logs)

    # faster-whisper грузит модель в память один раз — небыстрая операция,
    # поэтому сервис создаётся здесь, а не на каждое голосовое сообщение.
    logger.info("Загружаю модель faster-whisper (%s)...", config.whisper_model_size)
    transcription_service = FasterWhisperTranscriptionService(config.whisper_model_size)
    metric_extraction_service = OpenAIMetricExtractionService(config.openai_api_key)
    voice_log_service = VoiceLogService(transcription_service, metric_extraction_service)

    bot = Bot(
        token=config.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = Dispatcher(storage=MemoryStorage())

    access_middleware = AccessMiddleware(access_service)
    dispatcher.message.middleware(access_middleware)
    dispatcher.callback_query.middleware(access_middleware)

    # Внедряются в обработчики автоматически аргументами по имени (DI aiogram)
    dispatcher["config"] = config
    dispatcher["repositories"] = repositories
    dispatcher["family_member_service"] = family_member_service
    dispatcher["log_service"] = log_service
    dispatcher["voice_log_service"] = voice_log_service

    for router in get_routers():
        dispatcher.include_router(router)

    logger.info("Health OS bot is starting...")
    await bot.delete_webhook(drop_pending_updates=True)
    await dispatcher.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Health OS bot stopped.")

