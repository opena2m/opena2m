"""GET/POST /v1/budgets — budget CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.models.schemas import BudgetCreate, BudgetResponse
from app.services.budget_service import BudgetService

router = APIRouter()


@router.get("/budgets")
async def list_budgets(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:budgets:read")
    budgets = await BudgetService.list_budgets(db)
    return [
        BudgetResponse(
            budget_id=b.budget_id,
            name=b.name,
            currency=b.currency,
            ceiling=b.ceiling,
            consumed=b.consumed,
            warn_threshold=b.warn_threshold,
            period=b.period,
            utilization=b.consumed / b.ceiling if b.ceiling > 0 else 0,
        ) for b in budgets
    ]


@router.post("/budgets", status_code=201)
async def create_budget(
    body: BudgetCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:budgets:write")
    budget = await BudgetService.create_budget(
        db,
        name=body.name,
        principal_id=body.principal_id,
        currency=body.currency,
        ceiling=body.ceiling,
        warn_threshold=body.warn_threshold,
        period=body.period,
    )
    return {"budget_id": budget.budget_id, "name": budget.name}


@router.get("/budgets/{budget_id}")
async def get_budget(
    budget_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    """Budget detail with contributing jobs (for BudgetDetail page)."""
    principal.require("aimp:budgets:read")
    from sqlalchemy import select
    from app.models.orm import Budget as BudgetModel, Job
    b = await db.get(BudgetModel, budget_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Budget not found.")
    # Contributing jobs
    jobs = (
        await db.execute(
            select(Job)
            .where(Job.principal_id == b.principal_id)
            .order_by(Job.created_at.desc())
            .limit(10)
        )
    ).scalars().all()
    return {
        "budget_id": b.budget_id,
        "principal_id": b.principal_id,
        "scope_domain_id": None,
        "ceiling_amount": b.ceiling,
        "ceiling_currency": b.currency,
        "window_kind": b.period or "total",
        "warn_at_percent": int(b.warn_threshold * 100),
        "hard_deny": True,
        "consumed": b.consumed,
        "utilization": b.consumed / b.ceiling if b.ceiling > 0 else 0,
        "window_starts_at": b.period_start.isoformat() if b.period_start else None,
        "window_resets_at": None,
        "history": [],
        "jobs": [{"job_id": j.job_id, "state": j.state, "cost_estimate": j.request_json.get("cost") if j.request_json else None} for j in jobs],
    }
