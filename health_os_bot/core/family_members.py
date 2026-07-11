"""Регистрация членов семьи: обычное добавление (только admin) и
особый путь для самого первого администратора (bootstrap), когда в
системе ещё нет ни одного admin, который мог бы его пригласить.
"""

from typing import Optional

from core.exceptions import AccessDeniedError
from database.interfaces import FamilyMembersRepository, UsersRepository
from database.models import FamilyMember, Role, User


class FamilyMemberService:
    """Бизнес-логика добавления членов семьи в Family_Members / Users."""

    def __init__(
        self,
        family_members_repository: FamilyMembersRepository,
        users_repository: UsersRepository,
    ) -> None:
        self._family_members_repository = family_members_repository
        self._users_repository = users_repository

    def add_family_member(
        self,
        acting_user: User,
        name: str,
        gender: str,
        birth_year: int,
        tg_id: Optional[int] = None,
    ) -> FamilyMember:
        """Добавить нового члена семьи. Доступно только admin.

        Если у нового члена семьи есть свой Telegram (передан tg_id),
        дополнительно создаётся строка в Users с ролью user.
        """
        if acting_user.role != Role.ADMIN.value:
            raise AccessDeniedError("Добавлять членов семьи может только администратор")

        member = self._family_members_repository.add(
            name=name, gender=gender, birth_year=birth_year
        )

        if tg_id is not None:
            self._users_repository.add(
                tg_id=tg_id, name=name, role=Role.USER.value, family_member_id=member.id
            )

        return member

    def register_bootstrap_admin(
        self, tg_id: int, name: str, gender: str, birth_year: int
    ) -> FamilyMember:
        """Зарегистрировать самого первого администратора.

        Право на этот вызов уже проверено вызывающим кодом (наличие tg_id в
        BOOTSTRAP_ADMIN_IDS из .env) — это единственный способ получить роль
        admin, когда в Users ещё нет ни одной записи.
        """
        member = self._family_members_repository.add(
            name=name, gender=gender, birth_year=birth_year
        )
        self._users_repository.add(
            tg_id=tg_id, name=name, role=Role.ADMIN.value, family_member_id=member.id
        )
        return member

