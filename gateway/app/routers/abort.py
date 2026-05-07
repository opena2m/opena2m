"""POST /v1/jobs/{job_id}/abort — AIMP §01.6.5 emergency stop."""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.core.errors import aimp_error
from app.core.state_machine import JobState, can_abort
from app.models.orm import Quote
from app.models.schemas import AbortRequest, AbortResponse, EstimatedCost
from app.services.adapter_registry import adapter_registry
from app.services.budget_service import BudgetService
from app.services.job_service import JobService

router = APIRouter()
logger = logging.getLogger("aimp.abort")


@router.post("/jobs/{job_id}/abort", response_model=AbortResponse)
async def abort(
    job_id: str,
    body: AbortRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    job = await JobService.get_by_id(db, job_id)
    if job is None:
        raise aimp_error("ERR_JOB_NOT_FOUND", "Job not found.", "resource", status=404)

    # Abort is idempotent
    if job.state in ("ABORTED", "FAILED", "COMPLETED"):
        return AbortResponse(job_id=job_id, state=job.state)

    if not can_abort(JobState(job.state)):
        raise aimp_error(
            "ERR_INVALID_STATE_TRANSITION",
            f"Cannot abort job in state {job.state}.",
            "validation",
            status=409,
        )

    await JobService.transition(
        db, job, JobState.ABORTED, principal.principal_id,
        reason=body.reason or "client_abort"
    )
    logger.info("Job %s aborted by %s (mode: %s)", job_id, principal.principal_id, body.recovery_mode)

    # Notify adapter (C5) — best-effort, 3s timeout
    if job.domain_id:
        adapter = adapter_registry.get(job.domain_id)
        if adapter:
            try:
                await asyncio.wait_for(
                    adapter.abort(job_id, job.device_id or "", body.recovery_mode),
                    timeout=3.0,
                )
            except asyncio.TimeoutError:
                logger.warning("Adapter abort timed out for job %s", job_id)
            except Exception as exc:
                logger.warning("Adapter abort error for job %s: %s", job_id, exc)

    # Release budget reservation (C5) — look up cost from used quote
    if job.principal_id:
        try:
            used_quote = (
                await db.execute(
                    select(Quote).where(
                        Quote.job_id == job.job_id,
                        Quote.used_at.isnot(None),
                    )
                )
            ).scalar_one_or_none()
            if used_quote:
                cost = used_quote.estimated_cost_json
                await BudgetService.release(
                    db,
                    principal_id=job.principal_id,
                    amount=cost.get("amount", 0),
                    currency=cost.get("currency", "USD"),
                )
        except Exception as exc:
            logger.warning("Budget release error for job %s: %s", job_id, exc)

    return AbortResponse(
        job_id=job_id,
        state="ABORTED",
        final_cost=None,
        partial_outputs=[],
    )
