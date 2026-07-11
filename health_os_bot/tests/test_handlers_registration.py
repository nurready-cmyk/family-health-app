"""handlers/registration.py: /start (bootstrap admin) и /add_family_member."""

from conftest import make_callback_update, make_message_update

from core.family_members import FamilyMemberService


async def test_bootstrap_admin_registers_as_admin(make_dispatcher, bot, bot_session, family_members_repo, users_repo):
    dispatcher = make_dispatcher(family_member_service=FamilyMemberService(family_members_repo, users_repo))

    await dispatcher.feed_update(bot, make_message_update(999, 1, text="/start"))
    await dispatcher.feed_update(bot, make_message_update(999, 2, text="Папа"))
    await dispatcher.feed_raw_update(bot, make_callback_update(999, 3, "gender:male"))
    await dispatcher.feed_update(bot, make_message_update(999, 4, text="1990"))

    user = users_repo.get_by_tg_id(999)
    assert user is not None
    assert user.role == "admin"
    assert len(family_members_repo.items) == 1
    assert any("администратор" in text for text in bot_session.sent_texts)


async def test_unknown_user_is_rejected(make_dispatcher, bot, bot_session, family_members_repo, users_repo):
    dispatcher = make_dispatcher(family_member_service=FamilyMemberService(family_members_repo, users_repo))

    await dispatcher.feed_update(bot, make_message_update(12345, 1, text="/start"))

    assert any("не зарегистрированы" in text for text in bot_session.sent_texts)
    assert users_repo.get_by_tg_id(12345) is None


async def test_admin_can_add_family_member_with_telegram(
    make_dispatcher, bot, bot_session, dad, family_members_repo, users_repo
):
    dispatcher = make_dispatcher(family_member_service=FamilyMemberService(family_members_repo, users_repo))

    await dispatcher.feed_update(bot, make_message_update(111, 1, text="/add_family_member"))
    await dispatcher.feed_update(bot, make_message_update(111, 2, text="Сын"))
    await dispatcher.feed_raw_update(bot, make_callback_update(111, 3, "gender:male"))
    await dispatcher.feed_update(bot, make_message_update(111, 4, text="2015"))
    await dispatcher.feed_update(bot, make_message_update(111, 5, text="333"))

    new_user = users_repo.get_by_tg_id(333)
    assert new_user is not None and new_user.role == "user"
    assert any("Добавлен новый член семьи" in text for text in bot_session.sent_texts)


async def test_admin_can_add_family_member_without_telegram(
    make_dispatcher, bot, bot_session, dad, family_members_repo, users_repo
):
    dispatcher = make_dispatcher(family_member_service=FamilyMemberService(family_members_repo, users_repo))

    await dispatcher.feed_update(bot, make_message_update(111, 1, text="/add_family_member"))
    await dispatcher.feed_update(bot, make_message_update(111, 2, text="Дочь"))
    await dispatcher.feed_raw_update(bot, make_callback_update(111, 3, "gender:female"))
    await dispatcher.feed_update(bot, make_message_update(111, 4, text="2017"))
    await dispatcher.feed_update(bot, make_message_update(111, 5, text="нет"))

    assert len(family_members_repo.items) == 2  # Папа (fixture) + Дочь
    assert len(users_repo.items) == 1  # новых Users-строк не появилось


async def test_regular_user_cannot_add_family_member(
    make_dispatcher, bot, bot_session, mom, family_members_repo, users_repo
):
    dispatcher = make_dispatcher(family_member_service=FamilyMemberService(family_members_repo, users_repo))

    await dispatcher.feed_update(bot, make_message_update(222, 1, text="/add_family_member"))

    assert any("только администратор" in text for text in bot_session.sent_texts)
    assert len(family_members_repo.items) == 1  # осталась только Мама (fixture)

