"""Job service — state machine transitions, audit writing, telemetry."""
from __future__ import annotations
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.state_machine import JobState, StateMachineError, validate_transition, is_terminal
from app.models.orm import Job, JobStateTransition, TelemetryEvent, AuditEntry
from app.core.redis_client import redis_client

logger = logging.getLogger("aimp.job_service")


class JobService:

    @staticmethod
    async def create_job(
        db: AsyncSession,
        job_id: str,
        device_id: Optional[str],
        domain_id: Optional[str],
        principal_id: Optional[str],
        request_json: Optional[dict],
        asset_json: Optional[dict] = None,
        payload_json: Optional[dict] = None,
        logistics_json: Optional[dict] = None,
        metadata_json: Optional[dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> Job:
        job = Job(
            job_id=job_id,
            device_id=device_id,
            domain_id=domain_id,
            principal_id=principal_id,
            state=JobState.PENDING.value,
            request_json=request_json,
            asset_json=asset_json,
            payload_json=payload_json,
            logistics_json=logistics_json,
            metadata_json=metadata_json,
            idempotency_key=idempotency_key,
        )
        db.add(job)
        await db.flush()
        await JobService._record_transition(db, job, None, JobState.PENDING, principal_id, "job_created")
        return job

    @staticmethod
    async def transition(
        db: AsyncSession,
        job: Job,
        to_state: JobState,
        principal_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> Job:
        from app.services.webhook_dispatcher import WebhookDispatcher
        from_state = JobState(job.state)
        validate_transition(from_state, to_state)
        old_state = job.state
        job.state = to_state.value
        job.updated_at = datetime.now(timezone.utc)
        if is_terminal(to_state):
            job.completed_at = datetime.now(timezone.utc)
        await db.flush()
        await JobService._record_transition(db, job, from_state, to_state, principal_id, reason)
        # Publish state change to Redis
        now_iso = datetime.now(timezone.utc).isoformat()
        await redis_client.publish(f"job:{job.job_id}:events", {
            "event": "state_transition",
            "job_id": job.job_id,
            "from": old_state,
            "to": to_state.value,
            "at": now_iso,
        })
        # Enqueue webhook for state_transition (C4)
        webhook_payload = {
            "event": "state_transition",
            "aimp_version": "1.0",
            "job_id": job.job_id,
            "from": old_state,
            "to": to_state.value,
            "at": now_iso,
            "principal_id": principal_id,
            "telemetry_summary": {"progress": job.progress},
            "trace_id": (job.metadata_json or {}).get("trace_id"),
        }
        dispatcher = WebhookDispatcher()
        asyncio.create_task(
            dispatcher.enqueue(db, job.job_id, "state_transition", webhook_payload)
        )
        # Budget settle on COMPLETED (H4)
        if to_state == JobState.COMPLETED and job.principal_id:
            asyncio.create_task(
                JobService._settle_budget(job.job_id, job.principal_id)
            )
        return job

    @staticmethod
    async def _settle_budget(job_id: str, principal_id: str) -> None:
        """Settle budget reservation when job completes."""
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.budget_service import BudgetService
            from app.models.orm import Quote
            from sqlalchemy import select
            async with AsyncSessionLocal() as db:
                job = await JobService.get_by_id(db, job_id)
                if job is None:
                    return
                used_quote = (
                    await db.execute(
                        select(Quote).where(
                            Quote.job_id == job_id,
                            Quote.used_at.isnot(None),
                        )
                    )
                ).scalar_one_or_none()
                if used_quote:
                    cost = used_quote.estimated_cost_json
                    await BudgetService.settle(
                        db,
                        principal_id=principal_id,
                        amount=cost.get("amount", 0),
                        currency=cost.get("currency", "USD"),
                    )
                await db.commit()
        except Exception as exc:
            logger.warning("Budget settle error for job %s: %s", job_id, exc)

    @staticmethod
    async def _record_transition(
        db: AsyncSession,
        job: Job,
        from_state: Optional[JobState],
        to_state: JobState,
        principal_id: Optional[str],
        reason: Optional[str],
    ) -> None:
        entry_data = {
            "job_id": job.job_id,
            "event_type": "state_transition",
            "from_state": from_state.value if from_state else None,
            "to_state": to_state.value,
            "principal_id": principal_id,
            "reason": reason,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        entry_hash, signature = AuditLog.sign_entry(entry_data)

        transition = JobStateTransition(
            job_id=job.job_id,
            from_state=from_state.value if from_state else None,
            to_state=to_state.value,
            principal_id=principal_id,
            reason=reason,
            entry_hash=entry_hash,
            signature=signature,
        )
        db.add(transition)

        audit = AuditEntry(
            job_id=job.job_id,
            event_type="state_transition",
            principal_id=principal_id,
            payload_json=entry_data,
            entry_hash=entry_hash,
            signature=signature,
        )
        db.add(audit)
        await db.flush()

    @staticmethod
    async def update_progress(
        db: AsyncSession,
        job: Job,
        progress: float,
    ) -> None:
        job.progress = max(0.0, min(1.0, progress))
        job.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await redis_client.publish(f"job:{job.job_id}:events", {
            "event": "progress",
            "job_id": job.job_id,
            "progress": job.progress,
            "state": job.state,
        })

    @staticmethod
    async def add_telemetry(
        db: AsyncSession,
        job_id: str,
        channel: str,
        kind: str,
        value_json: Optional[dict] = None,
        media_url: Optional[str] = None,
        media_expires_at: Optional[datetime] = None,
    ) -> TelemetryEvent:
        event = TelemetryEvent(
            job_id=job_id,
            channel=channel,
            kind=kind,
            value_json=value_json,
            media_url=media_url,
            media_expires_at=media_expires_at,
        )
        db.add(event)
        await db.flush()
        await redis_client.publish(f"job:{job_id}:telemetry", {
            "channel": channel,
            "kind": kind,
            "value": value_json,
            "media_url": media_url,
            "at": datetime.now(timezone.utc).isoformat(),
        })
        return event

    @staticmethod
    async def get_by_id(db: AsyncSession, job_id: str) -> Optional[Job]:
        result = await db.execute(select(Job).where(Job.job_id == job_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def list_jobs(
        db: AsyncSession,
        state: Optional[str] = None,
        device_id: Optional[str] = None,
        domain_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Job], int]:
        from sqlalchemy import func
        q = select(Job)
        if state:
            q = q.where(Job.state == state)
        if device_id:
            q = q.where(Job.device_id == device_id)
        if domain_id:
            q = q.where(Job.domain_id == domain_id)
        count_q = select(func.count()).select_from(q.subquery())
        total = (await db.execute(count_q)).scalar() or 0
        q = q.order_by(desc(Job.created_at)).offset((page - 1) * page_size).limit(page_size)
        jobs = (await db.execute(q)).scalars().all()
        return list(jobs), total

    @staticmethod
    async def set_error(db: AsyncSession, job: Job, error_code: str, error_message: str) -> None:
        job.error_code = error_code
        job.error_message = error_message
        await db.flush()

    @staticmethod
    async def write_audit_event(
        db: AsyncSession,
        job_id: Optional[str],
        event_type: str,
        principal_id: Optional[str],
        payload: dict,
    ) -> None:
        entry_hash, signature = AuditLog.sign_entry({
            "job_id": job_id,
            "event_type": event_type,
            "principal_id": principal_id,
            "payload": payload,
            "at": datetime.now(timezone.utc).isoformat(),
        })
        entry = AuditEntry(
            job_id=job_id,
            event_type=event_type,
            principal_id=principal_id,
            payload_json=payload,
            entry_hash=entry_hash,
            signature=signature,
        )
        db.add(entry)
        await db.flush()
