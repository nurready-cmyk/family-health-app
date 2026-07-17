"""Личные правила члена семьи («обучение» бота) — проверяются раньше общих
правил из core/rules.py.

Schema Knowledge_Base хранит правило одним полем rule_text (family_member_id,
rule_text, priority) — в отличие от GAS-версии (telegram-bot/Sheets.gs), там
были отдельные колонки triggerKeywords/recommendationText. Здесь пользователь
пишет правило целиком свободным текстом (например: «если гемоглобин низкий,
мне лично помогает больше гречки и меньше кофе»), а сопоставление ищет
упоминание отклонившегося показателя прямо в этом тексте.
"""

from core.access import AccessContext
from core.exceptions import AccessDeniedError
from core.norms import get_indicator_label
from database.interfaces import KnowledgeBaseRepository
from database.models import KnowledgeRule


class KnowledgeBaseService:
    """Бизнес-логика личных правил: добавление (с проверкой прав) и сопоставление."""

    def __init__(self, knowledge_base_repository: KnowledgeBaseRepository) -> None:
        self._knowledge_base_repository = knowledge_base_repository

    def add_rule(
        self, access: AccessContext, family_member_id: str, rule_text: str, priority: int = 0
    ) -> KnowledgeRule:
        """Сохранить личное правило, если у access есть право писать за family_member_id."""
        if not access.can_act_for(family_member_id):
            raise AccessDeniedError("Нет прав добавлять правила для этого члена семьи")

        return self._knowledge_base_repository.add(
            family_member_id=family_member_id,
            rule_text=rule_text,
            priority=priority,
        )

    def get_matching_rules(
        self, family_member_id: str, triggered_indicator_keys: list[str]
    ) -> list[KnowledgeRule]:
        """Личные правила, в тексте которых упоминается название текущего
        отклонившегося показателя (по русской подписи или по ключу).
        """
        rules = self._knowledge_base_repository.get_by_family_member_id(family_member_id)
        if not rules or not triggered_indicator_keys:
            return []

        triggered_labels = [get_indicator_label(key).lower() for key in triggered_indicator_keys]

        return [
            rule
            for rule in rules
            if any(label in rule.rule_text.lower() for label in triggered_labels)
        ]

