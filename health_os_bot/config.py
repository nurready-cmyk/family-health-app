"""Конфигурация приложения из переменных окружения (.env).

Ничто в этом файле не обращается к Telegram, Google Sheets или OpenAI — он
только собирает настройки, чтобы остальной код не трогал os.environ напрямую.
"""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    """Неизменяемая конфигурация Health OS бота на время работы процесса."""

    bot_token: str
    openai_api_key: str
    google_sheet_id: str
    google_credentials_path: str
    google_drive_folder_id: str
    whisper_model_size: str
    bootstrap_admin_ids: tuple[int, ...]


def _parse_admin_ids(raw: str) -> tuple[int, ...]:
    """Разобрать список Telegram id через запятую из .env."""
    if not raw:
        return tuple()

    return tuple(int(item.strip()) for item in raw.split(",") if item.strip())


def load_config() -> Config:
    """Прочитать и провалидировать все переменные окружения один раз при старте."""
    return Config(
        bot_token=os.environ["BOT_TOKEN"],
        openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
        google_sheet_id=os.environ["GOOGLE_SHEET_ID"],
        google_credentials_path=os.environ.get("GOOGLE_CREDENTIALS_PATH", "credentials.json"),
        google_drive_folder_id=os.environ.get("GOOGLE_DRIVE_FOLDER_ID", ""),
        whisper_model_size=os.environ.get("WHISPER_MODEL_SIZE", "base"),
        bootstrap_admin_ids=_parse_admin_ids(os.environ.get("BOOTSTRAP_ADMIN_IDS", "")),
    )

