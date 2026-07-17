"""Абстрактные интерфейсы репозиториев (паттерн Репозиторий).

Это единственный контракт, на который имеют право опираться core/ и
handlers/. Сегодня за этими интерфейсами стоит Google Sheets
(см. sheets_repositories.py), завтра может встать PostgreSQL — сигнатуры
методов ниже не изменятся ни на символ.
"""

from abc import ABC, abstractmethod
from typing import Optional

from database.models import (
    AnalysisEntry,
    FamilyMember,
    KnowledgeRule,
    LogEntry,
    MedicalRecord,
    User,
)


class FamilyMembersRepository(ABC):
    """Реестр всех членов семьи, включая тех, у кого нет Telegram."""

    @abstractmethod
    def add(self, name: str, gender: str, birth_year: int) -> FamilyMember:
        """Зарегистрировать нового члена семьи и вернуть созданную запись."""

    @abstractmethod
    def get_all(self) -> list[FamilyMember]:
        """Вернуть всех членов семьи."""

    @abstractmethod
    def get_by_id(self, family_member_id: str) -> Optional[FamilyMember]:
        """Найти члена семьи по id или вернуть None."""


class UsersRepository(ABC):
    """Только те члены семьи, у кого есть собственный Telegram-аккаунт."""

    @abstractmethod
    def add(self, tg_id: int, name: str, role: str, family_member_id: str) -> User:
        """Зарегистрировать нового пользователя бота."""

    @abstractmethod
    def get_by_tg_id(self, tg_id: int) -> Optional[User]:
        """Найти пользователя по Telegram id — основной способ идентификации."""

    @abstractmethod
    def get_all(self) -> list[User]:
        """Вернуть всех зарегистрированных пользователей бота."""


class LogsRepository(ABC):
    """Ежедневные метрики (энергия, сон, питание, тренировки)."""

    @abstractmethod
    def add(
        self,
        entry_date: str,
        family_member_id: str,
        metric_type: str,
        value: str,
        notes: str,
    ) -> LogEntry:
        """Записать одну метрику за один день для одного члена семьи."""

    @abstractmethod
    def get_by_family_member_id(self, family_member_id: str) -> list[LogEntry]:
        """Вернуть всю историю метрик члена семьи."""

    @abstractmethod
    def get_since(self, family_member_id: str, since_date: str) -> list[LogEntry]:
        """Вернуть метрики члена семьи начиная с указанной даты (включительно)."""


class MedicalDataRepository(ABC):
    """Анализы, обследования и приёмы врачей."""

    @abstractmethod
    def add(
        self,
        record_date: str,
        family_member_id: str,
        event_type: str,
        summary: str,
        document_url: str,
    ) -> MedicalRecord:
        """Сохранить одно медицинское событие."""

    @abstractmethod
    def get_by_family_member_id(self, family_member_id: str) -> list[MedicalRecord]:
        """Вернуть всю медицинскую историю члена семьи."""


class KnowledgeBaseRepository(ABC):
    """Личные правила члена семьи — то, чему пользователь «учит» бота."""

    @abstractmethod
    def add(self, family_member_id: str, rule_text: str, priority: int) -> KnowledgeRule:
        """Сохранить новое личное правило."""

    @abstractmethod
    def get_by_family_member_id(self, family_member_id: str) -> list[KnowledgeRule]:
        """Вернуть личные правила члена семьи, отсортированные по приоритету."""


class AnalysesRepository(ABC):
    """Значения показателей анализов (по одному на строку), см. database/models.py."""

    @abstractmethod
    def add(self, family_member_id: str, entry_date: str, indicator_key: str, value: str) -> AnalysisEntry:
        """Сохранить одно значение одного показателя."""

    @abstractmethod
    def get_latest_values(self, family_member_id: str) -> dict[str, str]:
        """Вернуть последнее известное значение по каждому показателю: {indicator_key: value}."""

    @abstractmethod
    def get_by_family_member_id(self, family_member_id: str) -> list[AnalysisEntry]:
        """Вернуть всю историю анализов члена семьи."""


class NormsRepository(ABC):
    """Полный справочник показателей из листа Справочник_Анализов — и
    переопределения нормы для встроенных показателей, и показатели,
    добавленные пользователем с нуля (которых нет в core/norms.NORMS)."""

    @abstractmethod
    def get_catalog(self) -> dict[str, tuple[str, Optional[tuple[float, float]], Optional[tuple[float, float]]]]:
        """Вернуть {indicator_key: (русское_название, норма_мужчины|None, норма_женщины|None)}
        для каждой строки листа, где заполнены название и код. Норма может
        быть не задана (тогда элементы 1 и 2 — None) — например, пользователь
        только что добавил новый показатель и ещё не вписал для него норму.
        """


class PersonalNormsRepository(ABC):
    """Нормы конкретного члена семьи (например, ребёнка) из листа Личные_Нормы.

    В отличие от NormsRepository (общая норма по полу), здесь норма привязана
    к конкретному family_member_id — нужна для случаев, когда норма зависит
    не только от пола, но и от возраста (дети) или другой индивидуальной
    особенности. Имеет приоритет над NormsRepository.
    """

    @abstractmethod
    def get_overrides(self, family_member_id: str) -> dict[str, tuple[float, float]]:
        """Вернуть {indicator_key: (мин, макс)} — персональные нормы этого
        члена семьи. Показатели без вписанной персональной нормы в результат
        не попадают.
        """

