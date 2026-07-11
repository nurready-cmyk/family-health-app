"""Доменные модели предметной области.

Это единственные объекты, с которыми должны работать core/ и handlers/.
Ни gspread, ни PostgreSQL, ни любая другая СУБД здесь не упоминаются —
модели не знают, откуда они взялись.
"""

from dataclasses import dataclass
from enum import Enum


class Role(str, Enum):
    """Роль пользователя, определяющая права доступа в core/."""

    ADMIN = "admin"
    USER = "user"


class Gender(str, Enum):
    """Пол члена семьи — используется для норм анализов и т.п."""

    MALE = "male"
    FEMALE = "female"


class MetricType(str, Enum):
    """Тип ежедневной метрики в Logs."""

    ENERGY = "energy"
    SLEEP = "sleep"
    FOOD = "food"
    WORKOUT = "workout"


@dataclass(frozen=True)
class FamilyMember:
    """Строка листа Family_Members — реестр всех членов семьи."""

    id: str
    name: str
    gender: str
    birth_year: int


@dataclass(frozen=True)
class User:
    """Строка листа Users — только те, у кого есть Telegram-аккаунт."""

    id: str
    tg_id: int
    name: str
    role: str
    family_member_id: str


@dataclass(frozen=True)
class LogEntry:
    """Строка листа Logs — ежедневная метрика одного члена семьи."""

    id: str
    date: str
    family_member_id: str
    metric_type: str
    value: str
    notes: str


@dataclass(frozen=True)
class MedicalRecord:
    """Строка листа Medical_Data — анализ, обследование или приём врача."""

    id: str
    date: str
    family_member_id: str
    event_type: str
    summary: str
    document_url: str


@dataclass(frozen=True)
class KnowledgeRule:
    """Строка листа Knowledge_Base — личное правило члена семьи."""

    id: str
    family_member_id: str
    rule_text: str
    priority: int

