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
from core.analyses import AnalysisService
from core.family_members import FamilyMemberService
from core.knowledge_base import KnowledgeBaseService
from core.logs import LogService
from core.medical_data import MedicalDataService
from core.photo import PhotoLogService
from core.voice import VoiceLogService
from database import build_repositories
from handlers import get_routers
from handlers.middlewares import AccessMiddleware
from services.faster_whisper_transcription import FasterWhisperTranscriptionService
from services.google_drive_upload import GoogleDriveUploadService
from services.openai_image_summary import OpenAIImageSummaryService
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
    medical_data_service = MedicalDataService(repositories.medical_data)
    knowledge_base_service = KnowledgeBaseService(repositories.knowledge_base)
    analysis_service = AnalysisService(
        repositories.analyses, knowledge_base_service, repositories.norms, repositories.personal_norms
    )

    # faster-whisper грузит модель в память один раз — небыстрая операция,
    # поэтому сервис создаётся здесь, а не на каждое голосовое сообщение.
    logger.info("Загружаю модель faster-whisper (%s)...", config.whisper_model_size)
    transcription_service = FasterWhisperTranscriptionService(config.whisper_model_size)
    metric_extraction_service = OpenAIMetricExtractionService(config.openai_api_key)
    voice_log_service = VoiceLogService(transcription_service, metric_extraction_service)

    photo_upload_service = GoogleDriveUploadService(
        config.google_credentials_path, config.google_drive_folder_id
    )
    image_summary_service = OpenAIImageSummaryService(config.openai_api_key)
    photo_log_service = PhotoLogService(photo_upload_service, image_summary_service)

    bot = Bot(
        token=config.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = Dispatcher(storage=MemoryStorage())

    access_middleware = AccessMiddleware()
    dispatcher.message.middleware(access_middleware)
    dispatcher.callback_query.middleware(access_middleware)

    # Внедряются в обработчики автоматически аргументами по имени (DI aiogram)
    dispatcher["config"] = config
    dispatcher["repositories"] = repositories
    dispatcher["access_service"] = access_service
    dispatcher["family_member_service"] = family_member_service
    dispatcher["log_service"] = log_service
    dispatcher["medical_data_service"] = medical_data_service
    dispatcher["knowledge_base_service"] = knowledge_base_service
    dispatcher["analysis_service"] = analysis_service
    dispatcher["voice_log_service"] = voice_log_service
    dispatcher["photo_log_service"] = photo_log_service

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

