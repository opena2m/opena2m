"""POST /v1/jobs/{job_id}/resume — HITL approval resume from AUDITING."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.core.errors import aimp_error
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
        raise aimp_error(
            "ERR_FORBIDDEN_SCOPE",
            "Only human or system principals may resume jobs.",
            "auth",
            status=403,
        )

    job = await JobService.get_by_id(db, job_id)
    if job is None:
        raise aimp_error("ERR_JOB_NOT_FOUND", "Job not found.", "resource", status=404)
    if job.state != JobState.AUDITING.value:
        raise aimp_error(
            "ERR_INVALID_STATE_TRANSITION",
            f"Job is in state {job.state}, not AUDITING.",
            "validation",
            status=409,
        )

    valid, reason = verify_token(body.approval_token, job_id)
    if not valid:
        raise aimp_error("ERR_APPROVAL_REQUIRED", f"Invalid approval token: {reason}", "policy", status=403)

    if body.decision == "CONTINUE":
        await JobService.transition(
            db, job, JobState.EXECUTING, principal.principal_id,
            reason=f"human_approved: {body.reviewer_note or ''}"
        )
        return ResumeResponse(job_id=job_id, state=JobState.EXECUTING.value)

    elif body.decision == "ABORT":
        await JobService.transition(
            db, job, JobState.ABORTED, principal.principal_id,
            reason=f"human_rejected: {body.reviewer_note or ''}"
        )
        return ResumeResponse(job_id=job_id, state=JobState.ABORTED.value)

    elif body.decision == "ADJUST":
        if not body.parameter_overrides:
            raise aimp_error(
                "ERR_INVALID_PAYLOAD",
                "ADJUST requires parameter_overrides.",
                "validation",
                status=422,
            )
        # Validate overrides do not touch protected fields
        forbidden = {"asset", "logistics", "risk_tier"}
        bad_keys = set(body.parameter_overrides.keys()) & forbidden
        if bad_keys:
            raise aimp_error(
                "ERR_UNSAFE_PARAMETER",
                f"Cannot override protected fields: {sorted(bad_keys)}",
                "safety",
                retryable=False,
                status=422,
            )
        # Merge overrides into job parameters
        job.payload_json = {**(job.payload_json or {}), **body.parameter_overrides}
        await db.flush()
        # Transition back to LOCKED so adapter picks up new params
        await JobService.transition(
            db, job, JobState.LOCKED, principal.principal_id,
            reason=f"human_adjusted: {body.reviewer_note or ''}"
        )
        return ResumeResponse(job_id=job_id, state=JobState.LOCKED.value)

    else:
        raise aimp_error("ERR_INVALID_PAYLOAD", f"Unknown decision: {body.decision}", "validation", status=422)
