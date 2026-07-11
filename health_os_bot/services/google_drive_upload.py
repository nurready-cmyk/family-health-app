"""Загрузка сканов анализов в Google Drive тем же сервис-аккаунтом, что и
Google Sheets, но независимо от database/ — services/ не должен зависеть от
слоя БД, поэтому учётные данные загружаются здесь заново, а не переиспользуют
database/sheets_client.py.

Используется "сырой" REST API Google Drive v3 через AuthorizedSession, а не
тяжёлый google-api-python-client — тот же результат с одной лёгкой
зависимостью (requests), которая нам и так нужна для транспорта google-auth.
"""

import json

import requests
from google.auth.transport.requests import AuthorizedSession
from google.oauth2.service_account import Credentials

from services.exceptions import UploadError
from services.interfaces import PhotoUploadService

_SCOPES = ["https://www.googleapis.com/auth/drive"]
_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink"
_PERMISSIONS_URL_TEMPLATE = "https://www.googleapis.com/drive/v3/files/{file_id}/permissions"
_BOUNDARY = "health_os_bot_upload_boundary"


class GoogleDriveUploadService(PhotoUploadService):
    def __init__(self, credentials_path: str, folder_id: str) -> None:
        credentials = Credentials.from_service_account_file(credentials_path, scopes=_SCOPES)
        self._session = AuthorizedSession(credentials)
        self._folder_id = folder_id

    def upload(self, file_bytes: bytes, filename: str, mime_type: str) -> str:
        metadata = {"name": filename, "parents": [self._folder_id]}
        body = self._build_multipart_body(metadata, file_bytes, mime_type)

        try:
            response = self._session.post(
                _UPLOAD_URL,
                data=body,
                headers={"Content-Type": f"multipart/related; boundary={_BOUNDARY}"},
            )
            response.raise_for_status()
            uploaded_file = response.json()
            file_id = uploaded_file["id"]

            # Файлы сервис-аккаунта по умолчанию приватны — открываем доступ
            # по ссылке, чтобы семья могла посмотреть скан прямо из Telegram.
            self._session.post(
                _PERMISSIONS_URL_TEMPLATE.format(file_id=file_id),
                json={"role": "reader", "type": "anyone"},
            )
        except requests.exceptions.RequestException as error:
            raise UploadError(f"Не удалось загрузить файл в Google Drive: {error}") from error

        return uploaded_file.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"

    @staticmethod
    def _build_multipart_body(metadata: dict, file_bytes: bytes, mime_type: str) -> bytes:
        prefix = (
            f"--{_BOUNDARY}\r\n"
            f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
            f"{json.dumps(metadata)}\r\n"
            f"--{_BOUNDARY}\r\n"
            f"Content-Type: {mime_type}\r\n\r\n"
        ).encode("utf-8")
        suffix = f"\r\n--{_BOUNDARY}--".encode("utf-8")
        return prefix + file_bytes + suffix

