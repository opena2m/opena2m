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
