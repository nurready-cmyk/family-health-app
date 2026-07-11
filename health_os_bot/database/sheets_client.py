"""Единственный модуль, который напрямую импортирует gspread.

GoogleSheetsClient отвечает за подключение к Google (сервис-аккаунт) и выдачу
листов по имени. SheetRowStore — общая CRUD-логика поверх одного листа
(чтение всех строк, добавление, обновление по id), которую переиспользуют
все репозитории в sheets_repositories.py.

Если Google Sheets когда-нибудь заменят на PostgreSQL — это единственный
файл (вместе с sheets_repositories.py), который придётся переписать.
database/interfaces.py и всё, что снаружи database/, не меняется.
"""

import uuid
from typing import Any, Optional

import gspread
from google.oauth2.service_account import Credentials

SPREADSHEET_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


class GoogleSheetsClient:
    """Обёртка над одной Google-таблицей, к которой привязан сервис-аккаунт."""

    def __init__(self, credentials_path: str, spreadsheet_id: str) -> None:
        credentials = Credentials.from_service_account_file(
            credentials_path, scopes=SPREADSHEET_SCOPES
        )
        gspread_client = gspread.authorize(credentials)
        self._spreadsheet = gspread_client.open_by_key(spreadsheet_id)

    def get_or_create_worksheet(
        self, title: str, headers: list[str]
    ) -> gspread.worksheet.Worksheet:
        """Вернуть лист по имени, создав его с заголовками, если он ещё не существует."""
        try:
            return self._spreadsheet.worksheet(title)
        except gspread.exceptions.WorksheetNotFound:
            worksheet = self._spreadsheet.add_worksheet(
                title=title, rows=1000, cols=max(len(headers), 1)
            )
            worksheet.append_row(headers)
            return worksheet


class SheetRowStore:
    """Общий доступ к строкам одного листа по заголовкам колонок.

    Каждый репозиторий в sheets_repositories.py владеет одним SheetRowStore
    и переводит его "плоские" словари в доменные модели из models.py.
    """

    def __init__(self, worksheet: gspread.worksheet.Worksheet, headers: list[str]) -> None:
        self._worksheet = worksheet
        self._headers = headers

    @staticmethod
    def generate_id() -> str:
        return str(uuid.uuid4())

    def read_all(self) -> list[dict[str, Any]]:
        """Вернуть все строки листа как словари вида {заголовок: значение}."""
        return self._worksheet.get_all_records()

    def append(self, row: dict[str, Any]) -> None:
        """Добавить одну строку, разложив словарь по порядку заголовков листа."""
        self._worksheet.append_row([row.get(header, "") for header in self._headers])

    def find_cell_by_id(self, row_id: str) -> Optional[gspread.cell.Cell]:
        """Найти ячейку с id в колонке id. gspread.Worksheet.find() уже
        возвращает None, если совпадений нет — отдельная обработка исключений
        не нужна.
        """
        id_column_index = self._headers.index("id") + 1
        return self._worksheet.find(row_id, in_column=id_column_index)

    def update_by_id(self, row_id: str, patch: dict[str, Any]) -> bool:
        """Точечно обновить несколько полей строки с данным id.

        Не используется репозиториями сегодня, но колонка id была добавлена
        в схему именно ради этой возможности — метод готов на будущее
        (например, редактирование личного правила или профиля).
        """
        cell = self.find_cell_by_id(row_id)
        if cell is None:
            return False
        for field_name, field_value in patch.items():
            column_index = self._headers.index(field_name) + 1
            self._worksheet.update_cell(cell.row, column_index, field_value)
        return True

    def delete_by_id(self, row_id: str) -> bool:
        """Удалить строку с данным id."""
        cell = self.find_cell_by_id(row_id)
        if cell is None:
            return False
        self._worksheet.delete_rows(cell.row)
        return True

