"""
BaseAdapter — the contract every AIMP domain adapter must satisfy.
This is a standalone copy that does NOT depend on the gateway internals.
When used inside the gateway, the gateway's own version is used instead.
"""
from __future__ import annotations
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("aimp.sdk")

GATEWAY_URL: Optional[str] = None
GATEWAY_TOKEN: Optional[str] = None


class BaseAdapter(ABC):
    """Abstract base for all AIMP domain adapters."""

    @property
    @abstractmethod
    def domain_id(self) -> str:
        """Full domain identifier, e.g. 'manufacturing.additive.fdm.v1'"""

    @property
    @abstractmethod
    def version(self) -> str:
        """Adapter package version, e.g. '1.0.0'"""

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
        Compute a price quote. Must return:
        {
            "cost": {"currency": str, "amount": float, "breakdown": {...}},
            "resource_consumption": {"material": [...], "machine_time_seconds": int, ...}
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
        Drive execution. Call self._set_state(), self._set_progress(),
        self._add_sensor(), self._add_media(), self._add_vision_check()
        to communicate with the gateway.
        """

    def get_consumables(self, device_id: str) -> List[Dict[str, Any]]:
        """Return current consumable levels."""
        return []

    async def abort(self, job_id: str, device_id: str, recovery_mode: str) -> None:
        """Override to implement device-level abort."""
        logger.info("[%s] abort: job=%s device=%s mode=%s", self.domain_id, job_id, device_id, recovery_mode)

    # ─── Gateway callbacks ────────────────────────────────────────────────────
    # When running inside the OpenA2M gateway, these delegate to job_service.
    # When running standalone (e.g., in tests), they call the REST API.

    async def _set_state(self, job_id: str, to_state: str, reason: str = "") -> None:
        try:
            from app.core.database import AsyncSessionLocal
            from app.core.state_machine import JobState
            from app.services.job_service import JobService
            async with AsyncSessionLocal() as db:
                job = await JobService.get_by_id(db, job_id)
                if job and job.state != to_state:
                    await JobService.transition(db, job, JobState(to_state), "system", reason)
                await db.commit()
        except ImportError:
            await self._rest_callback("state", job_id, {"state": to_state, "reason": reason})

    async def _set_progress(self, job_id: str, progress: float) -> None:
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.job_service import JobService
            async with AsyncSessionLocal() as db:
                job = await JobService.get_by_id(db, job_id)
                if job:
                    await JobService.update_progress(db, job, progress)
                await db.commit()
        except ImportError:
            await self._rest_callback("progress", job_id, {"progress": progress})

    async def _add_sensor(self, job_id: str, channel: str, value: Any, unit: str = "") -> None:
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.job_service import JobService
            async with AsyncSessionLocal() as db:
                await JobService.add_telemetry(db, job_id, channel, "sensor",
                                               value_json={"value": value, "unit": unit})
                await db.commit()
        except ImportError:
            pass

    async def _add_media(self, job_id: str, channel: str, url: str, mime: str = "image/jpeg") -> None:
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.job_service import JobService
            expires = datetime.now(timezone.utc) + timedelta(hours=24)
            async with AsyncSessionLocal() as db:
                await JobService.add_telemetry(db, job_id, channel, "media",
                                               value_json={"mime": mime},
                                               media_url=url, media_expires_at=expires)
                await db.commit()
        except ImportError:
            pass

    async def _add_vision_check(self, job_id: str, check_name: str, passed: bool,
                                 confidence: float = 1.0, detail: str = "") -> None:
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.job_service import JobService
            async with AsyncSessionLocal() as db:
                await JobService.add_telemetry(db, job_id, check_name, "vision_check",
                                               value_json={"passed": passed, "confidence": confidence, "detail": detail})
                await db.commit()
        except ImportError:
            pass

    async def _rest_callback(self, action: str, job_id: str, data: dict) -> None:
        """Fallback: call gateway REST API when running outside the gateway process."""
        import httpx, os
        url = GATEWAY_URL or os.getenv("AIMP_GATEWAY_URL", "http://localhost:8080")
        token = GATEWAY_TOKEN or os.getenv("AIMP_GATEWAY_TOKEN", "dev-token")
        async with httpx.AsyncClient(base_url=url, timeout=10) as c:
            await c.post(f"/v1/internal/adapter-callback",
                         headers={"Authorization": f"Bearer {token}"},
                         json={"action": action, "job_id": job_id, **data})
