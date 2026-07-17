"""Одноразовая настройка справочника показателей анализов.

Запускается один раз (и безопасно повторно):

    python -m database.setup_analyses_reference

Создаёт лист Справочник_Анализов (русское название ↔ код indicator_key из
core/norms.py) и включает выпадающий список на колонке indicator_key листа
Analyses, ссылающийся на этот справочник — чтобы при ручном редактировании
таблицы нельзя было вписать несуществующий или неправильно набранный код.
Автоматический ввод анализов через бота (/analysis) этот справочник не
использует — там сопоставление уже делает match_indicator_key().
"""

from google.oauth2.service_account import Credentials
import gspread
from gspread.utils import ValidationConditionType

from config import load_config
from core.norms import NORMS

REFERENCE_SHEET_TITLE = "Справочник_Анализов"
REFERENCE_HEADERS = ["Русское название", "Код (indicator_key)"]


def main() -> None:
    config = load_config()
    credentials = Credentials.from_service_account_file(
        config.google_credentials_path,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ],
    )
    spreadsheet = gspread.authorize(credentials).open_by_key(config.google_sheet_id)

    reference_rows = [[norm.label, key] for key, norm in NORMS.items()]

    try:
        reference_sheet = spreadsheet.worksheet(REFERENCE_SHEET_TITLE)
    except gspread.exceptions.WorksheetNotFound:
        reference_sheet = spreadsheet.add_worksheet(
            title=REFERENCE_SHEET_TITLE, rows=len(reference_rows) + 1, cols=2
        )

    reference_sheet.clear()
    reference_sheet.update(
        values=[REFERENCE_HEADERS] + reference_rows, range_name="A1"
    )

    analyses_sheet = spreadsheet.worksheet("Analyses")
    headers = analyses_sheet.row_values(1)
    indicator_column_index = headers.index("indicator_key") + 1
    indicator_column_letter = gspread.utils.rowcol_to_a1(1, indicator_column_index)[:-1]

    analyses_sheet.add_validation(
        f"{indicator_column_letter}2:{indicator_column_letter}1000",
        ValidationConditionType.one_of_range,
        [f"={REFERENCE_SHEET_TITLE}!B2:B{len(reference_rows) + 1}"],
        strict=True,
        showCustomUi=True,
    )

    print(
        f"Готово: лист «{REFERENCE_SHEET_TITLE}» создан/обновлён ({len(reference_rows)} показателей), "
        f"выпадающий список включён на Analyses!{indicator_column_letter}2:{indicator_column_letter}1000."
    )


if __name__ == "__main__":
    main()
