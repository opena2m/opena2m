"""GET /v1/jobs/{job_id}/telemetry — AIMP §01.6.4 observe + SSE stream."""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.core.errors import aimp_error
from app.core.redis_client import redis_client
from app.models.orm import Job, TelemetryEvent
from app.models.schemas import (
    HumanActionRequired, MediaRef, SensorReading, TelemetryResponse, VisionCheckResult
)
from app.services.approval_token import mint_token
from app.services.job_service import JobService

router = APIRouter()
logger = logging.getLogger("aimp.telemetry")


@router.get("/jobs/{job_id}/telemetry", response_model=TelemetryResponse)
async def get_telemetry(
    job_id: str,
    since: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:telemetry")
    job = await JobService.get_by_id(db, job_id)
    if job is None:
        raise aimp_error("ERR_JOB_NOT_FOUND", f"Job '{job_id}' not found.", "resource", status=404)

    # Load recent telemetry events
    q = select(TelemetryEvent).where(TelemetryEvent.job_id == job_id).order_by(desc(TelemetryEvent.id)).limit(50)
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            q = q.where(TelemetryEvent.at >= since_dt)
        except ValueError:
            pass

    events = (await db.execute(q)).scalars().all()

    sensors = []
    media = []
    vision = []
    for ev in events:
        if ev.kind == "sensor":
            val = ev.value_json or {}
            sensors.append(SensorReading(
                channel=ev.channel,
                value=val.get("value"),
                unit=val.get("unit"),
                at=ev.at,
            ))
        elif ev.kind == "media":
            if ev.media_url:
                media.append(MediaRef(
                    channel=ev.channel,
                    kind=ev.value_json.get("mime", "image/jpeg") if ev.value_json else "image/jpeg",
                    url=ev.media_url,
                    captured_at=ev.at,
                    expires_at=ev.media_expires_at,
                ))
        elif ev.kind == "vision_check":
            val = ev.value_json or {}
            # Support both legacy `passed: bool` (old records) and new `verdict` field
            if "verdict" in val:
                verdict = val["verdict"]
            else:
                verdict = "pass" if val.get("passed", True) else "failure"
            vision.append(VisionCheckResult(
                check_name=ev.channel,
                verdict=verdict,
                confidence=val.get("confidence"),
                detail=val.get("detail"),
                at=ev.at,
                recommended_action=val.get("recommended_action"),
                evidence_media=val.get("evidence_media", []),
            ))

    # HITL info if auditing
    human_action = None
    if job.state == "AUDITING":
        req_json = job.request_json or {}
        audit_reqs = req_json.get("audit_requirements", {})
        checkpoints = audit_reqs.get("pause_for_human_at", [])
        checkpoint = checkpoints[0] if checkpoints else "manual_review"
        review_token = mint_token(job_id, "human://reviewer", checkpoint)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        human_action = HumanActionRequired(
            review_id=f"review-{job_id}",
            reason="Human review required before continuing execution.",
            instructions="Review the latest telemetry data and approve or reject.",
            checkpoint=checkpoint,
            approve_url=f"/review/{job_id}?token={review_token}",
            expires_at=expires_at,
            fallback_action="ABORT",
        )

    trace_id = (job.metadata_json or {}).get("trace_id")
    return TelemetryResponse(
        job_id=job_id,
        state=job.state,
        progress=job.progress,
        updated_at=job.updated_at,
        domain=job.domain_id,
        device_id=job.device_id,
        sensor_readings=sensors,
        media=media,
        vision_checks=vision,
        human_action_required=human_action,
        error_code=job.error_code,
        error_message=job.error_message,
        trace_id=trace_id,
    )


@router.get("/jobs/{job_id}/telemetry/stream")
async def stream_telemetry(
    job_id: str,
    principal: Principal = Depends(get_current_principal),
):
    """Server-Sent Events stream for real-time job updates."""
    principal.require("aimp:telemetry")

    async def event_generator():
        # Send initial keepalive
        yield "data: {\"type\":\"connected\"}\n\n"
        if not redis_client.available:
            # Fallback: poll DB
            from app.core.database import AsyncSessionLocal
            while True:
                async with AsyncSessionLocal() as db:
                    job = await JobService.get_by_id(db, job_id)
                    if job:
                        payload = json.dumps({
                            "type": "state",
                            "job_id": job_id,
                            "state": job.state,
                            "progress": job.progress,
                        })
                        yield f"data: {payload}\n\n"
                        if job.state in ("COMPLETED", "ABORTED", "FAILED"):
                            return
                await asyncio.sleep(2)
        else:
            async for message in redis_client.subscribe_channel(f"job:{job_id}:events"):
                yield f"data: {json.dumps(message)}\n\n"
                if message.get("to") in ("COMPLETED", "ABORTED", "FAILED"):
                    return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
