"""Общие fixtures для тестов.

Фейковые репозитории реализуют database/interfaces.py в памяти — тесты не
трогают ни реальный Google Sheets, ни Telegram, ни OpenAI. RecordingSession
подменяет транспорт aiogram.Bot, поэтому handlers-тесты гоняются через
настоящий Dispatcher (middleware, FSM, DI), но без сети.
"""

from datetime import date

import pytest
from aiogram import Bot, Dispatcher
from aiogram.client.session.base import BaseSession
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.methods import TelegramMethod
from aiogram.methods.base import TelegramType
from aiogram.types import Chat, File, Message, PhotoSize
from aiogram.types import User as TgUser
from aiogram.types import Voice

from config import Config
from core.access import AccessService
from database import Repositories
from database.interfaces import (
    AnalysesRepository,
    FamilyMembersRepository,
    KnowledgeBaseRepository,
    LogsRepository,
    MedicalDataRepository,
    NormsRepository,
    PersonalNormsRepository,
    UsersRepository,
)
from database.models import AnalysisEntry, FamilyMember, KnowledgeRule, LogEntry, MedicalRecord, User
from handlers import get_routers
from handlers.middlewares import AccessMiddleware


# ---------- Фейковые репозитории ----------


class FakeFamilyMembersRepository(FamilyMembersRepository):
    def __init__(self) -> None:
        self.items: list[FamilyMember] = []

    def add(self, name, gender, birth_year):
        member = FamilyMember(id=f"fm{len(self.items) + 1}", name=name, gender=gender, birth_year=birth_year)
        self.items.append(member)
        return member

    def get_all(self):
        return list(self.items)

    def get_by_id(self, family_member_id):
        return next((m for m in self.items if m.id == family_member_id), None)


class FakeUsersRepository(UsersRepository):
    def __init__(self) -> None:
        self.items: list[User] = []

    def add(self, tg_id, name, role, family_member_id):
        user = User(id=f"u{len(self.items) + 1}", tg_id=tg_id, name=name, role=role, family_member_id=family_member_id)
        self.items.append(user)
        return user

    def get_by_tg_id(self, tg_id):
        return next((u for u in self.items if u.tg_id == tg_id), None)

    def get_all(self):
        return list(self.items)


class FakeLogsRepository(LogsRepository):
    def __init__(self) -> None:
        self.items: list[LogEntry] = []

    def add(self, entry_date, family_member_id, metric_type, value, notes):
        entry = LogEntry(
            id=f"l{len(self.items) + 1}", date=entry_date, family_member_id=family_member_id,
            metric_type=metric_type, value=value, notes=notes,
        )
        self.items.append(entry)
        return entry

    def get_by_family_member_id(self, family_member_id):
        return [e for e in self.items if e.family_member_id == family_member_id]

    def get_since(self, family_member_id, since_date):
        since = date.fromisoformat(since_date)
        return [e for e in self.get_by_family_member_id(family_member_id) if date.fromisoformat(e.date) >= since]


class FakeMedicalDataRepository(MedicalDataRepository):
    def __init__(self) -> None:
        self.items: list[MedicalRecord] = []

    def add(self, record_date, family_member_id, event_type, summary, document_url):
        record = MedicalRecord(
            id=f"md{len(self.items) + 1}", date=record_date, family_member_id=family_member_id,
            event_type=event_type, summary=summary, document_url=document_url,
        )
        self.items.append(record)
        return record

    def get_by_family_member_id(self, family_member_id):
        return [r for r in self.items if r.family_member_id == family_member_id]


class FakeKnowledgeBaseRepository(KnowledgeBaseRepository):
    def __init__(self) -> None:
        self.items: list[KnowledgeRule] = []

    def add(self, family_member_id, rule_text, priority):
        rule = KnowledgeRule(
            id=f"kb{len(self.items) + 1}", family_member_id=family_member_id,
            rule_text=rule_text, priority=priority,
        )
        self.items.append(rule)
        return rule

    def get_by_family_member_id(self, family_member_id):
        rules = [r for r in self.items if r.family_member_id == family_member_id]
        return sorted(rules, key=lambda r: r.priority, reverse=True)


class FakeAnalysesRepository(AnalysesRepository):
    def __init__(self) -> None:
        self.items: list[AnalysisEntry] = []

    def add(self, family_member_id, entry_date, indicator_key, value):
        entry = AnalysisEntry(
            id=f"a{len(self.items) + 1}", family_member_id=family_member_id,
            date=entry_date, indicator_key=indicator_key, value=value,
        )
        self.items.append(entry)
        return entry

    def get_latest_values(self, family_member_id):
        entries = sorted(self.get_by_family_member_id(family_member_id), key=lambda e: e.date)
        latest: dict[str, str] = {}
        for entry in entries:
            latest[entry.indicator_key] = entry.value
        return latest

    def get_by_family_member_id(self, family_member_id):
        return [e for e in self.items if e.family_member_id == family_member_id]


class FakeNormsRepository(NormsRepository):
    """По умолчанию пустой справочник — тесты норм используют значения из
    core/norms.py. Тест может подставить свои строки через .catalog перед
    вызовом сервиса: {indicator_key: (label, норма_мужчины|None, норма_женщины|None)}.
    """

    def __init__(self) -> None:
        self.catalog: dict[str, tuple[str, tuple[float, float] | None, tuple[float, float] | None]] = {}

    def get_catalog(self):
        return dict(self.catalog)


class FakePersonalNormsRepository(PersonalNormsRepository):
    """По умолчанию без персональных норм. Тест может подставить их через
    .overrides_by_member[family_member_id] перед вызовом сервиса.
    """

    def __init__(self) -> None:
        self.overrides_by_member: dict[str, dict[str, tuple[float, float]]] = {}

    def get_overrides(self, family_member_id):
        return dict(self.overrides_by_member.get(family_member_id, {}))


# ---------- Fixtures репозиториев ----------


@pytest.fixture
def family_members_repo() -> FakeFamilyMembersRepository:
    return FakeFamilyMembersRepository()


@pytest.fixture
def users_repo() -> FakeUsersRepository:
    return FakeUsersRepository()


@pytest.fixture
def logs_repo() -> FakeLogsRepository:
    return FakeLogsRepository()


@pytest.fixture
def medical_data_repo() -> FakeMedicalDataRepository:
    return FakeMedicalDataRepository()


@pytest.fixture
def knowledge_base_repo() -> FakeKnowledgeBaseRepository:
    return FakeKnowledgeBaseRepository()


@pytest.fixture
def analyses_repo() -> FakeAnalysesRepository:
    return FakeAnalysesRepository()


@pytest.fixture
def norms_repo() -> FakeNormsRepository:
    return FakeNormsRepository()


@pytest.fixture
def personal_norms_repo() -> FakePersonalNormsRepository:
    return FakePersonalNormsRepository()


@pytest.fixture
def repositories(
    family_members_repo,
    users_repo,
    logs_repo,
    medical_data_repo,
    knowledge_base_repo,
    analyses_repo,
    norms_repo,
    personal_norms_repo,
) -> Repositories:
    return Repositories(
        family_members=family_members_repo,
        users=users_repo,
        logs=logs_repo,
        medical_data=medical_data_repo,
        knowledge_base=knowledge_base_repo,
        analyses=analyses_repo,
        norms=norms_repo,
        personal_norms=personal_norms_repo,
    )


@pytest.fixture
def access_service(users_repo, family_members_repo) -> AccessService:
    return AccessService(users_repo, family_members_repo)


@pytest.fixture(autouse=True)
def _reset_norm_overrides():
    """core.norms._norm_overrides и _custom_indicators — глобальное состояние
    (см. set_norm_overrides/set_custom_indicators).

    Сбрасываем до и после каждого теста, чтобы переопределение норм или
    добавленный "свой" показатель в одном тесте не просачивались в соседние
    независимо от порядка запуска.
    """
    from core.norms import set_custom_indicators, set_norm_overrides

    set_norm_overrides({})
    set_custom_indicators({})
    yield
    set_norm_overrides({})
    set_custom_indicators({})


@pytest.fixture
def dad(family_members_repo, users_repo) -> FamilyMember:
    """Администратор семьи, tg_id=111."""
    member = family_members_repo.add("Папа", "male", 1990)
    users_repo.add(111, "Папа", "admin", member.id)
    return member


@pytest.fixture
def mom(family_members_repo, users_repo) -> FamilyMember:
    """Обычный пользователь, tg_id=222, пишет только за себя."""
    member = family_members_repo.add("Мама", "female", 1992)
    users_repo.add(222, "Мама", "user", member.id)
    return member


@pytest.fixture
def config() -> Config:
    return Config(
        bot_token="123456:TEST",
        openai_api_key="",
        google_sheet_id="test-sheet",
        google_credentials_path="test-credentials.json",
        google_drive_folder_id="test-folder",
        whisper_model_size="base",
        bootstrap_admin_ids=(999,),
    )


# ---------- Telegram-инфраструктура для handlers-тестов ----------


class RecordingSession(BaseSession):
    """Подменяет транспорт aiogram.Bot: не ходит в сеть, запоминает исходящие
    сообщения и отвечает заглушками на служебные методы."""

    def __init__(self) -> None:
        super().__init__()
        self.sent_texts: list[str] = []
        self.edited_texts: list[str] = []
        self.last_answered_callback_text: str | None = None

    async def close(self) -> None:
        pass

    async def make_request(self, bot, method: TelegramMethod[TelegramType], timeout=None):
        name = type(method).__name__
        if name == "SendMessage":
            self.sent_texts.append(method.text)
            sent_message = Message(
                message_id=len(self.sent_texts) + 1000, date=0,
                chat=Chat(id=1, type="private"), text=method.text,
            )
            return sent_message.as_(bot)
        if name == "EditMessageText":
            self.edited_texts.append(method.text)
            return True
        if name == "AnswerCallbackQuery":
            self.last_answered_callback_text = method.text
            return True
        if name == "GetMe":
            return TgUser(id=999999, is_bot=True, first_name="HealthOSBot", username="health_os_test_bot")
        if name == "DeleteWebhook":
            return True
        if name == "GetFile":
            return File(file_id="file123", file_unique_id="fu1", file_path="files/file_1.bin")
        return True

    async def stream_content(self, url, timeout, chunk_size, raise_for_status):
        yield b"fake-file-bytes"


@pytest.fixture
def bot_session() -> RecordingSession:
    return RecordingSession()


@pytest.fixture
def bot(config, bot_session) -> Bot:
    return Bot(token=config.bot_token, session=bot_session)


@pytest.fixture(scope="session")
def _dispatcher_with_routers() -> Dispatcher:
    """aiogram не позволяет подключить один Router к двум разным Dispatcher
    за время жизни процесса (см. Router.parent_router) — роутеры и
    middleware поэтому собираются один раз на весь прогон тестов. Изоляция
    между тестами достигается не пересборкой этого Dispatcher, а сбросом
    его workflow_data и FSM-хранилища в make_dispatcher.
    """
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.message.middleware(AccessMiddleware())
    dispatcher.callback_query.middleware(AccessMiddleware())
    for router in get_routers():
        dispatcher.include_router(router)
    return dispatcher


@pytest.fixture
def make_dispatcher(_dispatcher_with_routers, access_service, config, repositories):
    """Фабрика: make_dispatcher(log_service=..., voice_log_service=...) ->
    общий Dispatcher с этим набором зависимостей, внедрённых через DI
    aiogram, и с чистым FSM-состоянием (см. _dispatcher_with_routers)."""

    def _make(**extra_services) -> Dispatcher:
        dispatcher = _dispatcher_with_routers
        dispatcher.fsm.storage = MemoryStorage()  # чистое FSM-состояние на каждый тест

        dispatcher.workflow_data.clear()
        dispatcher["config"] = config
        dispatcher["repositories"] = repositories
        dispatcher["access_service"] = access_service
        for key, value in extra_services.items():
            dispatcher[key] = value

        return dispatcher

    return _make


def make_message_update(user_id: int, message_id: int, *, text: str = None, voice: bool = False,
                         photo: bool = False, caption: str = None):
    """Собрать aiogram.types.Update с одним Message от указанного пользователя."""
    from aiogram.types import Update

    chat = Chat(id=user_id, type="private")
    user = TgUser(id=user_id, is_bot=False, first_name="Test")
    kwargs = {"message_id": message_id, "date": 0, "chat": chat, "from_user": user}
    if text is not None:
        kwargs["text"] = text
    if voice:
        kwargs["voice"] = Voice(file_id="voice123", file_unique_id="vu1", duration=3)
    if photo:
        kwargs["photo"] = [PhotoSize(file_id="photo123", file_unique_id="pu1", width=800, height=600)]
    if caption is not None:
        kwargs["caption"] = caption
    message = Message(**kwargs)
    return Update(update_id=message_id, message=message)


def make_callback_update(user_id: int, message_id: int, data: str) -> dict:
    """Собрать сырой апдейт с CallbackQuery (передаётся через feed_raw_update)."""
    message_payload = make_message_update(user_id, message_id, text="x").message.model_dump(
        mode="python", exclude_none=True
    )
    return {
        "update_id": message_id,
        "callback_query": {
            "id": f"cb{message_id}",
            "from": {"id": user_id, "is_bot": False, "first_name": "Test"},
            "message": message_payload,
            "chat_instance": "1",
            "data": data,
        },
    }

