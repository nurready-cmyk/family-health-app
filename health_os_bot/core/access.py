"""Определение прав доступа: кто пишет боту и за кого может вносить данные.

Единственное место, где решается вопрос "admin видит всех, user — только
себя". Handlers обращаются сюда, а не проверяют role напрямую.
"""

from dataclasses import dataclass
from typing import Optional

from database.interfaces import FamilyMembersRepository, UsersRepository
from database.models import FamilyMember, Role, User


@dataclass(frozen=True)
class AccessContext:
    """Результат проверки доступа для одного tg_id."""

    user: User
    allowed_family_members: list[FamilyMember]

    def can_act_for(self, family_member_id: str) -> bool:
        """Может ли текущий пользователь вносить данные за этого члена семьи."""
        return any(member.id == family_member_id for member in self.allowed_family_members)


class AccessService:
    """Резолвит tg_id в AccessContext: кто это и за кого он может писать."""

    def __init__(
        self,
        users_repository: UsersRepository,
        family_members_repository: FamilyMembersRepository,
    ) -> None:
        self._users_repository = users_repository
        self._family_members_repository = family_members_repository

    def resolve(self, tg_id: int) -> Optional[AccessContext]:
        """Вернуть AccessContext для tg_id или None, если пользователь не зарегистрирован."""
        user = self._users_repository.get_by_tg_id(tg_id)
        if user is None:
            return None

        if user.role == Role.ADMIN.value:
            allowed_family_members = self._family_members_repository.get_all()
        else:
            own_family_member = self._family_members_repository.get_by_id(user.family_member_id)
            allowed_family_members = [own_family_member] if own_family_member else []

        return AccessContext(user=user, allowed_family_members=allowed_family_members)

