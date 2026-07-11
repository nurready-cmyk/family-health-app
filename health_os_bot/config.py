"""Application configuration loaded from environment variables (.env).

Nothing in this file talks to Telegram, Google Sheets, or OpenAI - it only
resolves settings so the rest of the app never touches os.environ directly.
"""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    """Immutable runtime configuration for the Health OS bot."""

    bot_token: str
    openai_api_key: str
    google_sheet_id: str
    google_credentials_path: str
    whisper_model_size: str
    bootstrap_admin_ids: tuple[int, ...]


def _parse_admin_ids(raw: str) -> tuple[int, ...]:
    """Parse a comma-separated list of Telegram user IDs from .env."""
    if not raw:
        return tuple()

    return tuple(int(item.strip()) for item in raw.split(",") if item.strip())


def load_config() -> Config:
    """Read and validate all required environment variables once at startup."""
    return Config(
        bot_token=os.environ["BOT_TOKEN"],
        openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
        google_sheet_id=os.environ["GOOGLE_SHEET_ID"],
        google_credentials_path=os.environ.get("GOOGLE_CREDENTIALS_PATH", "credentials.json"),
        whisper_model_size=os.environ.get("WHISPER_MODEL_SIZE", "base"),
        bootstrap_admin_ids=_parse_admin_ids(os.environ.get("BOOTSTRAP_ADMIN_IDS", "")),
    )

