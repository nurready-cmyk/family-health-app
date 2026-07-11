"""core/family_members.py: добавление членов семьи и bootstrap-администратор."""

import pytest

from core.exceptions import AccessDeniedError
from core.family_members import FamilyMemberService


@pytest.fixture
def service(family_members_repo, users_repo) -> FamilyMemberService:
    return FamilyMemberService(family_members_repo, users_repo)


def test_admin_can_add_family_member_without_telegram(service, dad, family_members_repo, users_repo):
    member = service.add_family_member(dad_user(users_repo), name="Сын", gender="male", birth_year=2015)
    assert member.name == "Сын"
    assert len(family_members_repo.items) == 2  # Папа (fixture) + Сын
    assert len(users_repo.items) == 1  # Users не увеличился — у Сына нет tg_id


def test_admin_can_add_family_member_with_telegram(service, dad, family_members_repo, users_repo):
    member = service.add_family_member(
        dad_user(users_repo), name="Сын", gender="male", birth_year=2015, tg_id=333
    )
    new_user = users_repo.get_by_tg_id(333)
    assert new_user is not None
    assert new_user.role == "user"
    assert new_user.family_member_id == member.id


def test_user_cannot_add_family_member(service, mom, users_repo):
    with pytest.raises(AccessDeniedError):
        service.add_family_member(mom_user(users_repo), name="Дочь", gender="female", birth_year=2017)


def test_register_bootstrap_admin_creates_family_member_and_admin_user(service, family_members_repo, users_repo):
    member = service.register_bootstrap_admin(tg_id=555, name="Папа", gender="male", birth_year=1990)
    user = users_repo.get_by_tg_id(555)
    assert user is not None
    assert user.role == "admin"
    assert user.family_member_id == member.id


def dad_user(users_repo):
    return users_repo.get_by_tg_id(111)


def mom_user(users_repo):
    return users_repo.get_by_tg_id(222)

