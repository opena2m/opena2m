"""AIMP §04 — Policy engine: evaluates rules on quote/execute."""
from __future__ import annotations
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Policy

logger = logging.getLogger("aimp.policy")


@dataclass
class PolicyContext:
    principal_id: str
    principal_kind: str  # agent | human | system
    domain_id: str
    device_id: str
    risk_tier: Optional[str]
    estimated_amount: Optional[float]
    currency: str
    budget_limit: Optional[float]


@dataclass
class PolicyVerdict:
    action: str  # allow | deny | require_approval | require_hitl
    reason: str
    policy_id: Optional[str] = None
    policy_name: Optional[str] = None


_BUILTIN_POLICIES = [
    {
        "policy_id": "builtin-deny-hazardous",
        "name": "Require approval for hazardous tier",
        "priority": 10,
        "enabled": True,
        "rule": {
            "conditions": {"risk_tier": "hazardous"},
            "action": "require_approval",
            "reason": "hazardous_domain_requires_human_approval",
        },
    },
    {
        "policy_id": "builtin-hitl-restricted",
        "name": "HITL for restricted tier",
        "priority": 20,
        "enabled": True,
        "rule": {
            "conditions": {"risk_tier": "restricted"},
            "action": "require_hitl",
        },
    },
    {
        "policy_id": "builtin-allow-routine",
        "name": "Allow routine jobs",
        "priority": 100,
        "enabled": True,
        "rule": {
            "conditions": {"risk_tier": "routine"},
            "action": "allow",
        },
    },
]


class PolicyEngine:

    @staticmethod
    def _match(conditions: dict, ctx: PolicyContext) -> bool:
        for key, value in conditions.items():
            if key == "risk_tier":
                if ctx.risk_tier != value:
                    return False
            elif key == "domain_prefix":
                if not ctx.domain_id.startswith(value):
                    return False
            elif key == "principal_kind":
                if ctx.principal_kind != value:
                    return False
            elif key == "amount_exceeds":
                if ctx.estimated_amount is None or ctx.estimated_amount <= value:
                    return False
        return True

    @classmethod
    async def evaluate(cls, db: AsyncSession, ctx: PolicyContext) -> PolicyVerdict:
        # Load DB policies
        db_policies = (await db.execute(
            select(Policy).where(Policy.enabled == True).order_by(Policy.priority)
        )).scalars().all()

        # Merge with builtins (builtins have lower priority number = higher priority)
        all_policies = list(_BUILTIN_POLICIES)
        for p in db_policies:
            all_policies.append({
                "policy_id": p.policy_id,
                "name": p.name,
                "priority": p.priority,
                "enabled": p.enabled,
                "rule": p.rule_json,
            })
        all_policies.sort(key=lambda p: p["priority"])

        for policy in all_policies:
            if not policy.get("enabled", True):
                continue
            rule = policy.get("rule", {})
            conditions = rule.get("conditions", {})
            if cls._match(conditions, ctx):
                verdict = PolicyVerdict(
                    action=rule.get("action", "allow"),
                    reason=f"Matched policy '{policy['name']}'",
                    policy_id=policy.get("policy_id"),
                    policy_name=policy.get("name"),
                )
                logger.info(
                    "Policy verdict: %s → %s (policy: %s)",
                    ctx.domain_id, verdict.action, policy["name"]
                )
                return verdict

        # Default allow
        return PolicyVerdict(action="allow", reason="No matching policy; default allow.")
