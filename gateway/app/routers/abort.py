"""POST /v1/jobs/{job_id}/abort — AIMP §01.6.5 emergency stop."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.core.state_machine import JobState, can_abort
from app.models.schemas import AbortRequest, AbortResponse, EstimatedCost
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
        raise HTTPException(status_code=404, detail="Job not found.")

    # Abort is idempotent
    if job.state in ("ABORTED", "FAILED", "COMPLETED"):
        return AbortResponse(job_id=job_id, state=job.state)

    if not can_abort(JobState(job.state)):
        raise HTTPException(status_code=409, detail=f"Cannot abort job in state {job.state}.")

    await JobService.transition(
        db, job, JobState.ABORTED, principal.principal_id,
        reason=body.reason or "client_abort"
    )
    logger.info("Job %s aborted by %s (mode: %s)", job_id, principal.principal_id, body.recovery_mode)

    return AbortResponse(
        job_id=job_id,
        state="ABORTED",
        final_cost=None,
        partial_outputs=[],
    )
