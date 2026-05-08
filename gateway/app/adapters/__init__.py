"""AIMP Adapter SDK — base class for all domain adapters."""
from __future__ import annotations
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

logger = logging.getLogger("aimp.sdk")


class BaseAdapter(ABC):
    """
    Every AIMP domain adapter must subclass BaseAdapter and implement
    compute_quote() and execute(). The gateway calls these methods in-process.
    """

    @property
    @abstractmethod
    def domain_id(self) -> str:
        """Full domain identifier, e.g. 'manufacturing.additive.fdm.v1'"""

    @property
    @abstractmethod
    def version(self) -> str:
        """Adapter package version, e.g. '0.1.0'"""

    @property
    def display_name(self) -> str:
        return self.domain_id

    @abstractmethod
    async def compute_quote(
        self,
        device_id: str,
        payload: Dict[str, Any],
        asset: Optional[Dict[str, Any]] = None,
        logistics: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Compute and return a quote dict with structure:
        {
            "cost": {
                "currency": "USD",
                "amount": float,
                "breakdown": { "material": ..., "machine_time": ..., "logistics": ..., "service_fee": ... }
            },
            "resource_consumption": {
                "material": [...],
                "machine_time_seconds": int,
                "energy_kwh": float
            }
        }
        Must NOT start any physical work.
        """

    @abstractmethod
    async def execute(
        self,
        job_id: str,
        device_id: str,
        audit_requirements: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Drive the job through execution. Must call gateway callbacks to:
        - update progress
        - add telemetry events
        - transition state (LOCKED→EXECUTING→[AUDITING→EXECUTING→]FULFILLING→COMPLETED)
        All state transitions must go through the job_service helper methods.
        """

    def get_consumables(self, device_id: str) -> List[Dict[str, Any]]:
        """Return current consumable levels for a device."""
        return []

    async def abort(self, job_id: str, device_id: str, recovery_mode: str) -> None:
        """Signal the device to abort. Override for physical devices."""
        logger.info("[%s] abort called for job %s on %s (mode=%s)", self.domain_id, job_id, device_id, recovery_mode)

    # ─── Callbacks into the gateway ───────────────────────────────────────────

    async def _set_state(self, job_id: str, to_state: str, reason: str = "") -> None:
        from app.core.database import AsyncSessionLocal
        from app.core.state_machine import JobState
        from app.services.job_service import JobService
        async with AsyncSessionLocal() as db:
            job = await JobService.get_by_id(db, job_id)
            if job and job.state != to_state:
                await JobService.transition(db, job, JobState(to_state), "system", reason or self.domain_id)
            await db.commit()

    async def _set_progress(self, job_id: str, progress: float) -> None:
        from app.core.database import AsyncSessionLocal
        from app.services.job_service import JobService
        async with AsyncSessionLocal() as db:
            job = await JobService.get_by_id(db, job_id)
            if job:
                await JobService.update_progress(db, job, progress)
            await db.commit()

    async def _add_sensor(
        self, job_id: str, channel: str, value: Any, unit: str = ""
    ) -> None:
        from app.core.database import AsyncSessionLocal
        from app.services.job_service import JobService
        async with AsyncSessionLocal() as db:
            await JobService.add_telemetry(
                db, job_id, channel, "sensor",
                value_json={"value": value, "unit": unit}
            )
            await db.commit()

    async def _add_media(
        self, job_id: str, channel: str, url: str, mime: str = "image/jpeg"
    ) -> None:
        from datetime import datetime, timedelta, timezone
        from app.core.database import AsyncSessionLocal
        from app.services.job_service import JobService
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        async with AsyncSessionLocal() as db:
            await JobService.add_telemetry(
                db, job_id, channel, "media",
                value_json={"mime": mime},
                media_url=url,
                media_expires_at=expires,
            )
            await db.commit()

    async def _add_vision_check(
        self,
        job_id: str,
        check_name: str,
        passed: bool,
        confidence: float = 1.0,
        detail: str = "",
        evidence_media: list = None,
    ) -> None:
        """Store a vision check result.  `passed=True` maps to verdict='pass', False→'failure'."""
        from app.core.database import AsyncSessionLocal
        from app.services.job_service import JobService
        verdict = "pass" if passed else "failure"
        recommended_action = "CONTINUE" if passed else "ABORT"
        async with AsyncSessionLocal() as db:
            await JobService.add_telemetry(
                db, job_id, check_name, "vision_check",
                value_json={
                    "verdict": verdict,
                    "confidence": confidence,
                    "detail": detail,
                    "recommended_action": recommended_action,
                    "evidence_media": evidence_media or [],
                }
            )
            await db.commit()
