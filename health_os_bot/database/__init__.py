"""Слой репозиториев (паттерн Репозиторий).

Любое чтение/запись в хранилище (сегодня — Google Sheets, завтра — возможно
PostgreSQL) идёт только через репозитории, объявленные здесь. Ничего за
пределами этого пакета не должно импортировать gspread напрямую.

build_repositories() — единственная точка входа для остального приложения:
core/ и handlers/ получают набор репозиториев и работают только с типами из
database.interfaces, не зная, что за ними стоит Google Sheets.

Импорт gspread-реализации намеренно сделан внутри build_repositories(), а не
на уровне модуля: простой `from database.interfaces import ...` (то, чем
пользуются core/ и тесты) не должен требовать установленного gspread.
"""

from dataclasses import dataclass

from database.interfaces import (
    FamilyMembersRepository,
    KnowledgeBaseRepository,
    LogsRepository,
    MedicalDataRepository,
    UsersRepository,
)


@dataclass(frozen=True)
class Repositories:
    """Набор всех репозиториев, который получают core/ и handlers/."""

    family_members: FamilyMembersRepository
    users: UsersRepository
    logs: LogsRepository
    medical_data: MedicalDataRepository
    knowledge_base: KnowledgeBaseRepository


def build_repositories(credentials_path: str, spreadsheet_id: str) -> Repositories:
    """Собрать все репозитории поверх одного подключения к Google Sheets."""
    from database.sheets_client import GoogleSheetsClient
    from database.sheets_repositories import (
        FamilyMembersSheetsRepository,
        KnowledgeBaseSheetsRepository,
        LogsSheetsRepository,
        MedicalDataSheetsRepository,
        UsersSheetsRepository,
    )

    client = GoogleSheetsClient(credentials_path, spreadsheet_id)
    return Repositories(
        family_members=FamilyMembersSheetsRepository(client),
        users=UsersSheetsRepository(client),
        logs=LogsSheetsRepository(client),
        medical_data=MedicalDataSheetsRepository(client),
        knowledge_base=KnowledgeBaseSheetsRepository(client),
    )

