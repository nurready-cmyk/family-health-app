"""database/sheets_client.py и database/sheets_repositories.py — логика
поверх фейкового листа в памяти (не настоящий Google Sheets, но настоящий
gspread.Worksheet API в части сигнатур)."""

import pytest

from database.sheets_client import SheetRowStore
from database.sheets_repositories import (
    ANALYSES_HEADERS,
    FAMILY_MEMBERS_HEADERS,
    KNOWLEDGE_BASE_HEADERS,
    LOGS_HEADERS,
    USERS_HEADERS,
    AnalysesSheetsRepository,
    FamilyMembersSheetsRepository,
    KnowledgeBaseSheetsRepository,
    LogsSheetsRepository,
    UsersSheetsRepository,
)


class FakeCell:
    def __init__(self, row: int) -> None:
        self.row = row


class FakeWorksheet:
    """Имитирует нужный нам минимум gspread.Worksheet API в памяти."""

    def __init__(self, headers: list[str]) -> None:
        self.headers = headers
        self.rows: list[list] = []

    def append_row(self, row):
        self.rows.append(list(row))

    def get_all_records(self):
        return [dict(zip(self.headers, row)) for row in self.rows]

    def find(self, query, in_column=None):
        col_index = in_column - 1
        for i, row in enumerate(self.rows):
            if str(row[col_index]) == str(query):
                return FakeCell(row=i + 2)  # +2: 1-индексация + строка заголовков
        return None

    def update_cell(self, row, col, value):
        self.rows[row - 2][col - 1] = value

    def delete_rows(self, row):
        del self.rows[row - 2]


def make_repo(repo_cls, headers):
    """Собрать репозиторий на фейковом листе, минуя GoogleSheetsClient."""
    worksheet = FakeWorksheet(headers)
    repo = repo_cls.__new__(repo_cls)
    repo._store = SheetRowStore(worksheet, headers)
    return repo


# ---------- SheetRowStore (низкоуровневые примитивы) ----------


def test_sheet_row_store_update_by_id():
    worksheet = FakeWorksheet(FAMILY_MEMBERS_HEADERS)
    store = SheetRowStore(worksheet, FAMILY_MEMBERS_HEADERS)
    store.append({"id": "abc", "name": "Тест", "gender": "male", "birth_year": 2000})

    assert store.update_by_id("abc", {"name": "Исправлено"}) is True
    assert store.read_all()[0]["name"] == "Исправлено"


def test_sheet_row_store_update_by_id_returns_false_when_not_found():
    worksheet = FakeWorksheet(FAMILY_MEMBERS_HEADERS)
    store = SheetRowStore(worksheet, FAMILY_MEMBERS_HEADERS)
    assert store.update_by_id("nonexistent", {"name": "x"}) is False


def test_sheet_row_store_delete_by_id():
    worksheet = FakeWorksheet(FAMILY_MEMBERS_HEADERS)
    store = SheetRowStore(worksheet, FAMILY_MEMBERS_HEADERS)
    store.append({"id": "abc", "name": "Тест", "gender": "male", "birth_year": 2000})

    assert store.delete_by_id("abc") is True
    assert store.read_all() == []


# ---------- FamilyMembersSheetsRepository ----------


def test_family_members_repository_add_and_get_all():
    repo = make_repo(FamilyMembersSheetsRepository, FAMILY_MEMBERS_HEADERS)
    dad = repo.add("Папа", "male", 1990)
    repo.add("Мама", "female", 1992)

    assert len(repo.get_all()) == 2
    assert repo.get_by_id(dad.id).name == "Папа"
    assert repo.get_by_id("nonexistent") is None


# ---------- UsersSheetsRepository ----------


def test_users_repository_get_by_tg_id():
    repo = make_repo(UsersSheetsRepository, USERS_HEADERS)
    repo.add(111, "Папа", "admin", "fm1")

    found = repo.get_by_tg_id(111)
    assert found is not None and found.role == "admin"
    assert repo.get_by_tg_id(999) is None


# ---------- LogsSheetsRepository ----------


def test_logs_repository_get_since_filters_by_date():
    repo = make_repo(LogsSheetsRepository, LOGS_HEADERS)
    repo.add("2026-07-01", "fm1", "energy", "5", "старая")
    repo.add("2026-07-10", "fm1", "energy", "8", "недавняя")
    repo.add("2026-07-10", "fm2", "sleep", "7", "не тот профиль")

    recent = repo.get_since("fm1", "2026-07-05")
    assert len(recent) == 1 and recent[0].value == "8"
    assert len(repo.get_by_family_member_id("fm1")) == 2


# ---------- KnowledgeBaseSheetsRepository ----------


def test_knowledge_base_repository_sorts_by_priority():
    repo = make_repo(KnowledgeBaseSheetsRepository, KNOWLEDGE_BASE_HEADERS)
    repo.add("fm1", "низкий приоритет", 1)
    repo.add("fm1", "высокий приоритет", 10)

    rules = repo.get_by_family_member_id("fm1")
    assert rules[0].rule_text == "высокий приоритет"


# ---------- AnalysesSheetsRepository ----------


def test_analyses_repository_get_latest_values_takes_most_recent():
    repo = make_repo(AnalysesSheetsRepository, ANALYSES_HEADERS)
    repo.add("fm1", "2026-07-01", "hemoglobin", "100")
    repo.add("fm1", "2026-07-10", "hemoglobin", "135")
    repo.add("fm1", "2026-07-05", "glucose", "5.2")

    latest = repo.get_latest_values("fm1")
    assert latest == {"hemoglobin": "135", "glucose": "5.2"}

