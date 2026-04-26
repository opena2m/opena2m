"""GET /v1/jobs — job listing and detail."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
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
        raise HTTPException(status_code=404, detail="Job not found.")
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
