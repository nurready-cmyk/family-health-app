"""Локальная расшифровка голосовых сообщений через faster-whisper.

Полностью офлайн и бесплатно (в отличие от OpenAI Whisper API). Модель
скачивается один раз при первом запуске (нужен интернет и место на диске),
дальше работает из локального кеша.

Модель загружается один раз при создании сервиса — это тяжёлая операция,
её нельзя повторять на каждое голосовое сообщение.
"""

from faster_whisper import WhisperModel

from services.exceptions import TranscriptionError
from services.interfaces import TranscriptionService


class FasterWhisperTranscriptionService(TranscriptionService):
    def __init__(self, model_size: str) -> None:
        self._model = WhisperModel(model_size, device="cpu", compute_type="int8")

    def transcribe(self, audio_file_path: str) -> str:
        # faster-whisper/ctranslate2 не документируют отдельную иерархию
        # исключений для битых файлов — на границе с внешней библиотекой
        # ловим широко и оборачиваем в понятную нам ошибку.
        try:
            segments, _info = self._model.transcribe(audio_file_path, language="ru")
            transcript = " ".join(segment.text.strip() for segment in segments).strip()
        except Exception as error:
            raise TranscriptionError(f"Не удалось распознать аудио: {error}") from error

        if not transcript:
            raise TranscriptionError("Распознавание вернуло пустой текст")

        return transcript

