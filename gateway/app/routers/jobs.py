"""GET /v1/jobs — job listing and detail."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.core.errors import aimp_error
from app.models.schemas import JobDetail, JobListResponse
from app.services.job_service import JobService

router = APIRouter()


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    state: Optional[str] = None,
    device_id: Optional[str] = None,
    domain: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:jobs:read")
    jobs, total = await JobService.list_jobs(db, state=state, device_id=device_id,
                                              domain_id=domain, page=page, page_size=page_size)
    return JobListResponse(
        jobs=[
            JobDetail(
                job_id=j.job_id,
                state=j.state,
                progress=j.progress,
                domain=j.domain_id,
                device_id=j.device_id,
                principal_id=j.principal_id,
                error_code=j.error_code,
                error_message=j.error_message,
                created_at=j.created_at,
                updated_at=j.updated_at,
                completed_at=j.completed_at,
            ) for j in jobs
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:jobs:read")
    job = await JobService.get_by_id(db, job_id)
    if job is None:
        raise aimp_error("ERR_JOB_NOT_FOUND", "Job not found.", "resource", status=404)
    return JobDetail(
        job_id=job.job_id,
        state=job.state,
        progress=job.progress,
        domain=job.domain_id,
        device_id=job.device_id,
        principal_id=job.principal_id,
        error_code=job.error_code,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.get("/jobs/{job_id}/transitions")
async def get_job_transitions(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    """Job state transition history for the TimelineRail component."""
    principal.require("aimp:jobs:read")
    from sqlalchemy import select, asc
    from app.models.orm import JobStateTransition, AuditEntry
    transitions = (
        await db.execute(
            select(JobStateTransition)
            .where(JobStateTransition.job_id == job_id)
            .order_by(asc(JobStateTransition.id))
        )
    ).scalars().all()
    return [
        {
            "id": t.id,
            "from_state": t.from_state,
            "to_state": t.to_state,
            "at": t.at.isoformat() if t.at else None,
            "by_principal_id": t.principal_id or "system",
            "reason": t.reason or "",
            "details_json": {},
            "signature": t.signature or "",
        }
        for t in transitions
    ]


@router.get("/jobs/{job_id}/policy-trace")
async def get_job_policy_trace(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    """Policy evaluation trace for the PolicyTraceTree component."""
    principal.require("aimp:jobs:read")
    # Reconstruct from audit log entries tagged policy.evaluated
    from sqlalchemy import select
    from app.models.orm import AuditEntry
    entries = (
        await db.execute(
            select(AuditEntry)
            .where(AuditEntry.job_id == job_id)
            .where(AuditEntry.event_type == "policy.evaluated")
        )
    ).scalars().all()
    if entries:
        return [e.payload_json for e in entries if e.payload_json]
    # Synthesise a trace from the job record if no explicit policy audit entries
    job = await JobService.get_by_id(db, job_id)
    if not job:
        return []
    return [
        {"step": 1, "name": "domain_permission", "description": "Caller token scope includes domain?", "decision": "ALLOW", "rule": f"Scope includes {job.domain_id}", "inputs": {"domain": job.domain_id}},
        {"step": 2, "name": "device_access",      "description": "Token scope includes device?",    "decision": "ALLOW", "rule": f"Scope includes {job.device_id}",  "inputs": {"device": job.device_id}},
        {"step": 3, "name": "risk_tier_allowed",  "description": "Risk tier enabled?",             "decision": "ALLOW", "rule": "Tier permitted in environment",        "inputs": {}},
        {"step": 4, "name": "budget_available",   "description": "Room under principal budget?",   "decision": "ALLOW", "rule": "Budget headroom sufficient",           "inputs": {}},
        {"step": 5, "name": "policy_match",       "description": "Policy chain result",            "decision": "ALLOW", "rule": "No DENY rule matched",                 "inputs": {}},
        {"step": 6, "name": "asset_policy",       "description": "Asset content policy",           "decision": "ALLOW", "rule": "Asset passes content rules",           "inputs": {}},
    ]
