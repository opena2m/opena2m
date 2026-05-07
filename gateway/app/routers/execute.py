"""POST /v1/execute — AIMP §01.6.3 confirm quote and start work."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

import jsonschema
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db, AsyncSessionLocal
from app.core.errors import aimp_error
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

    # Idempotency: if the job_id already exists in a non-QUOTED state, return cached result (H1)
    existing_job = await JobService.get_by_id(db, body.envelope.job_id)
    if existing_job and existing_job.state not in (JobState.PENDING.value, JobState.QUOTED.value):
        return ExecuteResponse(
            job_id=existing_job.job_id,
            state=existing_job.state,
        )

    # Check idempotency_key
    if body.envelope.idempotency_key:
        idem_job = (
            await db.execute(
                select(Job).where(Job.idempotency_key == body.envelope.idempotency_key)
            )
        ).scalar_one_or_none()
        if idem_job and idem_job.state not in (JobState.PENDING.value, JobState.QUOTED.value):
            return ExecuteResponse(job_id=idem_job.job_id, state=idem_job.state)

    # Load quote
    db_quote = (
        await db.execute(select(Quote).where(Quote.quote_id == body.quote_id))
    ).scalar_one_or_none()
    if db_quote is None:
        raise aimp_error("ERR_QUOTE_UNKNOWN", f"Quote '{body.quote_id}' not found.", "resource", status=404)

    # Quote must not be used
    if db_quote.used_at is not None:
        raise aimp_error("ERR_QUOTE_EXPIRED", "Quote already used.", "resource", retryable=True, status=409)

    # Quote TTL
    if datetime.now(timezone.utc) > db_quote.valid_until:
        raise aimp_error("ERR_QUOTE_EXPIRED", "Quote has expired.", "resource", retryable=True, status=409)

    # Load job (must be in QUOTED state)
    job = await JobService.get_by_id(db, body.envelope.job_id)
    if job is None:
        # Try by quote's job_id
        job = await JobService.get_by_id(db, db_quote.job_id)
    if job is None:
        raise aimp_error("ERR_JOB_NOT_FOUND", "Job not found.", "resource", status=404)
    if job.state != JobState.QUOTED.value:
        raise aimp_error(
            "ERR_INVALID_STATE_TRANSITION",
            f"Job is in state {job.state}, expected QUOTED.",
            "validation",
            status=409,
        )

    # Load device
    device = await db.get(Device, db_quote.device_id)
    if device is None:
        raise aimp_error("ERR_DEVICE_NOT_FOUND", "Device not found.", "resource", status=404)

    # Domain schema re-validation at execute time (C3)
    adapter = adapter_registry.get(db_quote.domain_id)
    if adapter:
        schema = adapter_registry.get_schema(db_quote.domain_id)
        payload = job.payload_json or {}
        if schema and payload:
            try:
                jsonschema.validate(payload, schema)
            except jsonschema.ValidationError as exc:
                raise aimp_error(
                    "ERR_INVALID_PAYLOAD",
                    exc.message,
                    "validation",
                    retryable=False,
                    status=422,
                    details={"path": list(exc.absolute_path)},
                )

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
        raise aimp_error("ERR_RISK_TIER_BLOCKED", f"Policy denied: {verdict.reason}", "policy", status=403)

    if verdict.action in ("require_approval", "require_hitl"):
        if not body.approval_token:
            raise aimp_error(
                "ERR_APPROVAL_REQUIRED",
                "Approval token required for this device's risk tier. "
                "Please obtain HITL approval before executing.",
                "policy",
                retryable=False,
                status=403,
            )
        valid, reason = verify_token(body.approval_token, job.job_id)
        if not valid:
            raise aimp_error("ERR_APPROVAL_REQUIRED", f"Invalid approval token: {reason}", "policy", status=403)

    # Asset hash verification (M9)
    asset = job.asset_json
    if asset and asset.get("hash_sha256"):
        try:
            import hashlib
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(asset["url"])
                r.raise_for_status()
                actual = hashlib.sha256(r.content).hexdigest()
                if actual != asset["hash_sha256"]:
                    raise aimp_error(
                        "ERR_ASSET_HASH_MISMATCH",
                        "Asset hash does not match declared hash.",
                        "asset",
                        retryable=False,
                        status=422,
                    )
        except aimp_error.__class__:
            raise
        except Exception as exc:
            raise aimp_error(
                "ERR_ASSET_UNREACHABLE",
                f"Asset URL is not reachable: {exc}",
                "asset",
                retryable=True,
                status=422,
            )

    # Budget reservation
    cost = db_quote.estimated_cost_json
    budget_ok, budget_reason = await BudgetService.check_and_reserve(
        db,
        principal_id=principal.principal_id,
        amount=cost.get("amount", 0),
        currency=cost.get("currency", "USD"),
    )
    if not budget_ok:
        raise aimp_error("ERR_BUDGET_EXCEEDED", budget_reason or "Budget exceeded.", "policy", status=402)

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
