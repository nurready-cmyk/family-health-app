"""Исключения слоя services/.

Handlers ловят их и показывают понятное сообщение — сами сервисы не
форматируют текст для Telegram.
"""


class TranscriptionError(Exception):
    """Не удалось распознать аудио."""


class ExtractionError(Exception):
    """Не удалось извлечь структурированные данные из текста."""

