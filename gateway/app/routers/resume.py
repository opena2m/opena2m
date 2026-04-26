"""POST /v1/jobs/{job_id}/resume — HITL approval resume from AUDITING."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.core.state_machine import JobState
from app.models.schemas import ResumeRequest, ResumeResponse
from app.services.approval_token import verify_token
from app.services.job_service import JobService

router = APIRouter()
logger = logging.getLogger("aimp.resume")


@router.post("/jobs/{job_id}/resume", response_model=ResumeResponse)
async def resume(
    job_id: str,
    body: ResumeRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    if principal.kind not in ("human", "system") and principal.principal_id != "system://dev":
        raise HTTPException(status_code=403, detail="Only human or system principals may resume jobs.")

    job = await JobService.get_by_id(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.state != JobState.AUDITING.value:
        raise HTTPException(status_code=409, detail=f"Job is in state {job.state}, not AUDITING.")

    valid, reason = verify_token(body.approval_token, job_id)
    if not valid:
        raise HTTPException(status_code=403, detail=f"Invalid approval token: {reason}")

    if body.decision == "approve":
        await JobService.transition(
            db, job, JobState.EXECUTING, principal.principal_id,
            reason=f"human_approved: {body.reviewer_note or ''}"
        )
        return ResumeResponse(job_id=job_id, state=JobState.EXECUTING.value)
    else:
        await JobService.transition(
            db, job, JobState.ABORTED, principal.principal_id,
            reason=f"human_rejected: {body.reviewer_note or ''}"
        )
        return ResumeResponse(job_id=job_id, state=JobState.ABORTED.value)
