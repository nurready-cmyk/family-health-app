"""core/access.py: кто ты по tg_id и за кого можешь писать."""


def test_admin_sees_all_family_members(access_service, dad, mom):
    context = access_service.resolve(111)
    assert context is not None
    assert context.user.role == "admin"
    ids = {member.id for member in context.allowed_family_members}
    assert ids == {dad.id, mom.id}


def test_user_sees_only_self(access_service, dad, mom):
    context = access_service.resolve(222)
    assert context is not None
    assert context.user.role == "user"
    assert [member.id for member in context.allowed_family_members] == [mom.id]


def test_unknown_tg_id_resolves_to_none(access_service, dad, mom):
    assert access_service.resolve(999) is None


def test_can_act_for_reflects_allowed_members(access_service, dad, mom):
    admin_context = access_service.resolve(111)
    assert admin_context.can_act_for(dad.id) is True
    assert admin_context.can_act_for(mom.id) is True

    user_context = access_service.resolve(222)
    assert user_context.can_act_for(mom.id) is True
    assert user_context.can_act_for(dad.id) is False

