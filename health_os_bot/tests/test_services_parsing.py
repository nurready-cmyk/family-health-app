"""Парсинг ответов внешних провайдеров (services/) — без реальной сети.

Каждый *Service._parse_response / _build_multipart_body — статический
метод, вынесенный отдельно именно для того, чтобы его можно было
протестировать без обращения к OpenAI/Drive.
"""

import pytest

from services.exceptions import ExtractionError
from services.google_drive_upload import GoogleDriveUploadService
from services.openai_image_summary import OpenAIImageSummaryService
from services.openai_text_extraction import OpenAIMetricExtractionService

# ---------- OpenAIMetricExtractionService (текст -> метрика) ----------

parse_metric = OpenAIMetricExtractionService._parse_response


def test_parses_valid_metric_json():
    metric = parse_metric('{"metric_type": "energy", "value": "8", "notes": "после сна"}')
    assert metric.metric_type == "energy"
    assert metric.value == "8"
    assert metric.notes == "после сна"


def test_missing_notes_defaults_to_empty_string():
    metric = parse_metric('{"metric_type": "sleep", "value": "7"}')
    assert metric.notes == ""


def test_broken_json_raises_extraction_error():
    with pytest.raises(ExtractionError):
        parse_metric("не JSON вообще")


def test_missing_required_field_raises_extraction_error():
    with pytest.raises(ExtractionError):
        parse_metric('{"value": "8"}')


def test_unknown_metric_type_raises_extraction_error():
    with pytest.raises(ExtractionError):
        parse_metric('{"metric_type": "mood", "value": "happy"}')


# ---------- OpenAIImageSummaryService (фото -> саммари) ----------

parse_summary = OpenAIImageSummaryService._parse_response


def test_parses_valid_summary_json():
    summary = parse_summary('{"event_type": "Общий анализ крови", "summary": "Гемоглобин снижен"}')
    assert summary.event_type == "Общий анализ крови"
    assert "Гемоглобин" in summary.summary


def test_summary_broken_json_raises_extraction_error():
    with pytest.raises(ExtractionError):
        parse_summary("не JSON")


def test_summary_empty_field_raises_extraction_error():
    with pytest.raises(ExtractionError):
        parse_summary('{"event_type": "УЗИ", "summary": ""}')


def test_summary_missing_event_type_raises_extraction_error():
    with pytest.raises(ExtractionError):
        parse_summary('{"summary": "всё в норме"}')


# ---------- GoogleDriveUploadService (multipart body) ----------

build_body = GoogleDriveUploadService._build_multipart_body


def test_multipart_body_contains_metadata_and_file_bytes():
    body = build_body({"name": "scan.jpg", "parents": ["folder123"]}, b"\xff\xd8\xff-fake-jpeg", "image/jpeg")

    assert body.startswith(b"--health_os_bot_upload_boundary\r\n")
    assert b'"name": "scan.jpg"' in body
    assert b"Content-Type: image/jpeg" in body
    assert b"\xff\xd8\xff-fake-jpeg" in body
    assert body.endswith(b"--health_os_bot_upload_boundary--")

