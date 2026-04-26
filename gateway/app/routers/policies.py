"""GET/POST /v1/policies — policy CRUD and dry-run."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, Optional

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.models.orm import Policy
from app.models.schemas import PolicyCreate, PolicyResponse, PolicyRule

router = APIRouter()


@router.get("/policies")
async def list_policies(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:policies:read")
    policies = (await db.execute(select(Policy).order_by(Policy.priority))).scalars().all()
    return [
        PolicyResponse(
            policy_id=p.policy_id,
            name=p.name,
            description=p.description,
            priority=p.priority,
            enabled=p.enabled,
            rule=PolicyRule(**p.rule_json),
        ) for p in policies
    ]


@router.post("/policies", status_code=201)
async def create_policy(
    body: PolicyCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:policies:write")
    policy = Policy(
        name=body.name,
        description=body.description,
        priority=body.priority,
        rule_json=body.rule.model_dump(),
    )
    db.add(policy)
    await db.flush()
    return {"policy_id": policy.policy_id, "name": policy.name}


@router.put("/policies/{policy_id}")
async def update_policy(
    policy_id: str,
    body: PolicyCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:policies:write")
    policy = await db.get(Policy, policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found.")
    policy.name = body.name
    policy.description = body.description
    policy.priority = body.priority
    policy.rule_json = body.rule.model_dump()
    return {"policy_id": policy_id, "updated": True}


class DryRunRequest(BaseModel):
    domain: str
    device_id: str
    risk_tier: Optional[str] = None
    principal_kind: str = "agent"
    estimated_amount: Optional[float] = None
    currency: str = "USD"


@router.post("/policies/dry-run")
async def dry_run(
    body: DryRunRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:policies:read")
    from app.services.policy_engine import PolicyEngine, PolicyContext
    ctx = PolicyContext(
        principal_id=principal.principal_id,
        principal_kind=body.principal_kind,
        domain_id=body.domain,
        device_id=body.device_id,
        risk_tier=body.risk_tier,
        estimated_amount=body.estimated_amount,
        currency=body.currency,
        budget_limit=None,
    )
    verdict = await PolicyEngine.evaluate(db, ctx)
    return {
        "action": verdict.action,
        "reason": verdict.reason,
        "policy_id": verdict.policy_id,
        "policy_name": verdict.policy_name,
    }
