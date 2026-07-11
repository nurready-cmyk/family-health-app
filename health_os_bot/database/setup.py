"""Одноразовая настройка Google-таблицы.

Запускается один раз перед первым стартом бота:

    python -m database.setup

Создаёт все 6 листов с заголовками, если их ещё нет. Ничего не удаляет и не
затирает — безопасно запускать повторно. Требует уже заполненный .env
(GOOGLE_CREDENTIALS_PATH, GOOGLE_SHEET_ID) — см. config.py.
"""

from config import load_config
from database import build_repositories


def main() -> None:
    config = load_config()
    build_repositories(config.google_credentials_path, config.google_sheet_id)
    print(
        "Готово: листы Family_Members, Users, Logs, Medical_Data, "
        "Knowledge_Base, Analyses созданы (или уже существовали)."
    )


if __name__ == "__main__":
    main()

