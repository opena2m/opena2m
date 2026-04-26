"""POST /v1/execute — AIMP §01.6.3 confirm quote and start work."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db, AsyncSessionLocal
from app.core.state_machine import JobState
from app.models.orm import Device, Job, Quote
from app.models.schemas import ExecuteRequest, ExecuteResponse
from app.services.adapter_registry import adapter_registry
from app.services.approval_token import verify_token
from app.services.budget_service import BudgetService
from app.services.job_service import JobService
from app.services.policy_engine import PolicyEngine, PolicyContext

router = APIRouter()
logger = logging.getLogger("aimp.execute")


@router.post("/execute", response_model=ExecuteResponse, status_code=202)
async def execute(
    body: ExecuteRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:execute")

    # Load quote
    db_quote = (
        await db.execute(select(Quote).where(Quote.quote_id == body.quote_id))
    ).scalar_one_or_none()
    if db_quote is None:
        raise HTTPException(status_code=404, detail=f"Quote '{body.quote_id}' not found.")

    # Quote must not be used
    if db_quote.used_at is not None:
        raise HTTPException(status_code=409, detail="Quote already used.")

    # Quote TTL
    if datetime.now(timezone.utc) > db_quote.valid_until:
        raise HTTPException(status_code=410, detail="Quote expired.")

    # Load job (must be in QUOTED state)
    job = await JobService.get_by_id(db, body.envelope.job_id)
    if job is None:
        # Try by quote's job_id
        job = await JobService.get_by_id(db, db_quote.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.state != JobState.QUOTED.value:
        raise HTTPException(status_code=409, detail=f"Job is in state {job.state}, expected QUOTED.")

    # Load device
    device = await db.get(Device, db_quote.device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found.")

    # Policy re-check at execute time
    ctx = PolicyContext(
        principal_id=principal.principal_id,
        principal_kind=principal.kind,
        domain_id=db_quote.domain_id,
        device_id=db_quote.device_id,
        risk_tier=device.risk_tier,
        estimated_amount=db_quote.estimated_cost_json.get("amount"),
        currency=db_quote.estimated_cost_json.get("currency", "USD"),
        budget_limit=None,
    )
    verdict = await PolicyEngine.evaluate(db, ctx)

    if verdict.action == "deny":
        raise HTTPException(status_code=403, detail=f"Policy denied: {verdict.reason}")

    if verdict.action in ("require_approval", "require_hitl"):
        if not body.approval_token:
            raise HTTPException(
                status_code=403,
                detail="Approval token required for this device's risk tier. "
                       "Please obtain HITL approval before executing.",
            )
        valid, reason = verify_token(body.approval_token, job.job_id)
        if not valid:
            raise HTTPException(status_code=403, detail=f"Invalid approval token: {reason}")

    # Budget reservation
    cost = db_quote.estimated_cost_json
    budget_ok, budget_reason = await BudgetService.check_and_reserve(
        db,
        principal_id=principal.principal_id,
        amount=cost.get("amount", 0),
        currency=cost.get("currency", "USD"),
    )
    if not budget_ok:
        raise HTTPException(status_code=402, detail=budget_reason)

    # Mark quote used
    db_quote.used_at = datetime.now(timezone.utc)

    # Transition: QUOTED → LOCKED
    await JobService.transition(db, job, JobState.LOCKED, principal.principal_id, "execute_confirmed")

    # Store audit requirements on job
    if body.audit_requirements:
        job.request_json = job.request_json or {}
        job.request_json["audit_requirements"] = body.audit_requirements.model_dump()

    transition_eta = datetime.now(timezone.utc) + timedelta(seconds=2)

    # Kick off adapter execution in background
    background_tasks.add_task(
        _run_adapter,
        job_id=job.job_id,
        device_id=db_quote.device_id,
        domain_id=db_quote.domain_id,
        audit_requirements=body.audit_requirements.model_dump() if body.audit_requirements else {},
    )

    return ExecuteResponse(
        job_id=job.job_id,
        state=JobState.LOCKED.value,
        transition_eta=transition_eta,
    )


async def _run_adapter(
    job_id: str,
    device_id: str,
    domain_id: str,
    audit_requirements: dict,
) -> None:
    """Background task: drive the adapter through execution."""
    adapter = adapter_registry.get(domain_id)
    if adapter is None:
        async with AsyncSessionLocal() as db:
            job = await JobService.get_by_id(db, job_id)
            if job:
                await JobService.set_error(db, job, "ADAPTER_NOT_FOUND", f"No adapter for {domain_id}")
                await JobService.transition(db, job, JobState.FAILED, "system", "adapter_not_found")
            await db.commit()
        return

    try:
        await adapter.execute(
            job_id=job_id,
            device_id=device_id,
            audit_requirements=audit_requirements,
        )
    except Exception as exc:
        logger.exception("Adapter execution error for job %s: %s", job_id, exc)
        async with AsyncSessionLocal() as db:
            job = await JobService.get_by_id(db, job_id)
            if job:
                await JobService.set_error(db, job, "ADAPTER_ERROR", str(exc))
                if job.state not in ("COMPLETED", "ABORTED", "FAILED"):
                    await JobService.transition(db, job, JobState.FAILED, "system", str(exc))
            await db.commit()
