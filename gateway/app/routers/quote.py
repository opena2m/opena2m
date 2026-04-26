"""POST /v1/quote — AIMP §01.6.2 price a proposed job."""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.config import settings
from app.core.database import get_db
from app.core.state_machine import JobState
from app.models.orm import Device, DeviceDomain, Quote
from app.models.schemas import (
    QuoteRequest, QuoteResponse, EstimatedCost, CostBreakdown, ResourceConsumption
)
from app.services.adapter_registry import adapter_registry
from app.services.job_service import JobService
from app.services.policy_engine import PolicyEngine, PolicyContext

router = APIRouter()
logger = logging.getLogger("aimp.quote")


@router.post("/quote", response_model=QuoteResponse, status_code=200)
async def quote(
    body: QuoteRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:quote")

    # Idempotency check
    if body.envelope.idempotency_key:
        existing = (
            await db.execute(
                select(Quote).join(Quote.job).where(
                    Quote.job.has(idempotency_key=body.envelope.idempotency_key)
                )
            )
        ).scalar_one_or_none()
        if existing:
            return _quote_to_response(body.envelope.job_id, existing)

    # Validate device
    device = await db.get(Device, body.device_id)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device '{body.device_id}' not found.")
    if device.disabled_at is not None:
        raise HTTPException(status_code=409, detail="Device is disabled.")

    # Validate domain
    dd = (
        await db.execute(
            select(DeviceDomain).where(
                DeviceDomain.device_id == body.device_id,
                DeviceDomain.domain_id == body.domain,
            )
        )
    ).scalar_one_or_none()
    if dd is None:
        raise HTTPException(
            status_code=422,
            detail=f"Device '{body.device_id}' does not support domain '{body.domain}'."
        )

    # Get adapter and compute quote
    adapter = adapter_registry.get(body.domain)
    if adapter is None:
        raise HTTPException(status_code=501, detail=f"No adapter registered for domain '{body.domain}'.")

    try:
        quote_result = await adapter.compute_quote(
            device_id=body.device_id,
            payload=body.payload or {},
            asset=body.asset.model_dump() if body.asset else None,
            logistics=body.logistics.model_dump() if body.logistics else None,
        )
    except Exception as exc:
        logger.exception("Adapter quote error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Adapter error: {exc}")

    # Policy evaluation
    ctx = PolicyContext(
        principal_id=principal.principal_id,
        principal_kind=principal.kind,
        domain_id=body.domain,
        device_id=body.device_id,
        risk_tier=device.risk_tier,
        estimated_amount=quote_result["cost"]["amount"],
        currency=quote_result["cost"]["currency"],
        budget_limit=body.budget_limit.amount if body.budget_limit else None,
    )
    verdict = await PolicyEngine.evaluate(db, ctx)
    if verdict.action == "deny":
        raise HTTPException(status_code=403, detail=f"Policy denied: {verdict.reason}")

    # Budget check
    exceeds = False
    if body.budget_limit:
        if quote_result["cost"]["amount"] > body.budget_limit.amount:
            exceeds = True

    # Create job record
    job = await JobService.create_job(
        db=db,
        job_id=body.envelope.job_id,
        device_id=body.device_id,
        domain_id=body.domain,
        principal_id=principal.principal_id,
        request_json=body.model_dump(),
        asset_json=body.asset.model_dump() if body.asset else None,
        payload_json=body.payload,
        logistics_json=body.logistics.model_dump() if body.logistics else None,
        metadata_json=body.envelope.metadata.model_dump() if body.envelope.metadata else None,
        idempotency_key=body.envelope.idempotency_key,
    )

    # Transition to QUOTED
    await JobService.transition(db, job, JobState.QUOTED, principal.principal_id, "quote_issued")

    # Persist quote
    valid_until = datetime.now(timezone.utc) + timedelta(seconds=settings.AIMP_QUOTE_TTL_SECONDS)
    cost = quote_result["cost"]
    db_quote = Quote(
        job_id=job.job_id,
        device_id=body.device_id,
        domain_id=body.domain,
        estimated_cost_json=cost,
        resource_consumption_json=quote_result.get("resource_consumption"),
        budget_reserve_json={"amount": cost["amount"], "currency": cost["currency"]},
        valid_until=valid_until,
    )
    db.add(db_quote)
    await db.flush()

    breakdown = cost.get("breakdown", {})
    return QuoteResponse(
        job_id=job.job_id,
        quote_id=db_quote.quote_id,
        estimated_cost=EstimatedCost(
            currency=cost["currency"],
            amount=cost["amount"],
            breakdown=CostBreakdown(
                material=breakdown.get("material", 0),
                machine_time=breakdown.get("machine_time", 0),
                logistics=breakdown.get("logistics", 0),
                service_fee=breakdown.get("service_fee", 0),
            ),
        ),
        resource_consumption=ResourceConsumption(
            **quote_result.get("resource_consumption", {})
        ) if quote_result.get("resource_consumption") else None,
        valid_until=valid_until,
        exceeds_budget=exceeds,
        risk_tier=device.risk_tier,
        requires_approval=verdict.action in ("require_approval", "require_hitl"),
    )


def _quote_to_response(job_id: str, q: Quote) -> QuoteResponse:
    cost = q.estimated_cost_json
    bd = cost.get("breakdown", {})
    return QuoteResponse(
        job_id=job_id,
        quote_id=q.quote_id,
        estimated_cost=EstimatedCost(
            currency=cost["currency"],
            amount=cost["amount"],
            breakdown=CostBreakdown(**bd) if bd else None,
        ),
        valid_until=q.valid_until,
    )
