"""
Reference adapter: manufacturing.additive.fdm.v1
Simulates FDM 3D printing with:
  - Spaghetti-failure vision check
  - Mid-build human-in-the-loop pause at 50%
Risk tier: restricted — HITL required.
"""
from __future__ import annotations
import asyncio
import logging
import random

from app.adapters import BaseAdapter

logger = logging.getLogger("aimp.adapter.fdm_sim")

DOMAIN_ID = "manufacturing.additive.fdm.v1"


class FDMSimAdapter(BaseAdapter):
    domain_id = DOMAIN_ID
    version = "0.1.0"
    display_name = "FDM 3D Print Simulator (with HITL)"

    # Simulated filament inventory per device
    _inventory = {
        "fdm-sim-1": [
            {"name": "PLA_white", "quantity": 412.5, "unit": "g"},
            {"name": "PETG_black", "quantity": 180.0, "unit": "g"},
        ]
    }

    async def compute_quote(self, device_id, payload, asset=None, logistics=None):
        material = payload.get("material", "PLA_white")
        layer_height_mm = payload.get("layer_height_mm", 0.2)
        infill_percent = payload.get("infill_percent", 20)
        support_enabled = payload.get("support_structures", False)

        # Rough cost model
        base_grams = 38.2
        support_factor = 1.15 if support_enabled else 1.0
        grams = round(base_grams * support_factor * (1 + (infill_percent - 20) / 100), 1)
        material_cost = round(grams * 0.025, 2)

        machine_seconds = int(3600 * (1 + (0.2 - layer_height_mm) / 0.2 * 0.5))
        machine_cost = round(machine_seconds / 3600 * 2.0, 2)
        service_fee = 1.50
        total = round(material_cost + machine_cost + service_fee, 2)

        return {
            "cost": {
                "currency": "USD",
                "amount": total,
                "breakdown": {
                    "material": material_cost,
                    "machine_time": machine_cost,
                    "logistics": 0.0,
                    "service_fee": service_fee,
                },
            },
            "resource_consumption": {
                "material": [{"name": material, "quantity": grams, "unit": "g"}],
                "machine_time_seconds": machine_seconds,
                "energy_kwh": round(machine_seconds * 0.00012, 3),
            },
        }

    def get_consumables(self, device_id):
        return self._inventory.get(device_id, [])

    async def execute(self, job_id, device_id, audit_requirements=None):
        audit_requirements = audit_requirements or {}
        snapshot_interval = audit_requirements.get("snapshot_interval_seconds", 15)
        vision_checks = audit_requirements.get("ai_vision_checks", [])
        pause_at = audit_requirements.get("pause_for_human_at", [])
        do_hitl = bool(pause_at)

        logger.info("[fdm-sim] Starting job %s on %s", job_id, device_id)

        # LOCKED → EXECUTING
        await self._set_state(job_id, "EXECUTING", "print_started")

        # Phase 1: 0% → 50% (first layer stack)
        logger.info("[fdm-sim] Job %s — Phase 1: 0→50%%", job_id)
        for i in range(1, 11):
            await asyncio.sleep(0.6)
            progress = i / 20  # 0.05 … 0.50
            await self._set_progress(job_id, progress)
            await self._emit_sensors(job_id, progress)

            # Vision check for spaghetti failure
            if "detect_spaghetti_failure" in vision_checks and i % 5 == 0:
                # Simulate: pass at low progress
                passed = True
                await self._add_vision_check(
                    job_id, "detect_spaghetti_failure", passed,
                    confidence=0.97,
                    detail="Layer adhesion nominal." if passed else "Possible spaghetti detected!"
                )
                if not passed:
                    logger.warning("[fdm-sim] Job %s: spaghetti vision check failed!", job_id)
                    await self._set_state(job_id, "ABORTED", "spaghetti_failure")
                    return

            # Snapshot
            if i % 3 == 0:
                await self._add_media(
                    job_id, "camera.top",
                    f"https://via.placeholder.com/640x480.jpg?text=Layer+{i*10}%25",
                )

        # HITL checkpoint at 50%
        if do_hitl:
            logger.info("[fdm-sim] Job %s — HITL checkpoint at 50%%", job_id)
            await self._set_state(job_id, "AUDITING", "mid_build_50_percent_checkpoint")

            # Wait for human to approve (poll state)
            max_wait = 300  # 5 minutes timeout for demo
            waited = 0
            while waited < max_wait:
                await asyncio.sleep(2)
                waited += 2
                from app.core.database import AsyncSessionLocal
                from app.services.job_service import JobService
                async with AsyncSessionLocal() as db:
                    job = await JobService.get_by_id(db, job_id)
                    if job is None:
                        return
                    if job.state == "EXECUTING":
                        logger.info("[fdm-sim] Job %s — HITL approved, resuming", job_id)
                        break
                    if job.state in ("ABORTED", "FAILED"):
                        logger.info("[fdm-sim] Job %s — HITL rejected or aborted", job_id)
                        return
            else:
                # Timeout: auto-abort
                logger.warning("[fdm-sim] Job %s HITL timed out; aborting", job_id)
                await self._set_state(job_id, "ABORTED", "hitl_timeout")
                return

        # Phase 2: 50% → 100%
        logger.info("[fdm-sim] Job %s — Phase 2: 50→100%%", job_id)
        for i in range(11, 21):
            await asyncio.sleep(0.6)
            progress = i / 20  # 0.55 … 1.00
            await self._set_progress(job_id, progress)
            await self._emit_sensors(job_id, progress)

            # Vision check in second half
            if "detect_spaghetti_failure" in vision_checks and i % 4 == 0:
                passed = random.random() > 0.05  # 95% pass rate
                await self._add_vision_check(
                    job_id, "detect_spaghetti_failure", passed,
                    confidence=round(0.88 + random.uniform(0, 0.10), 2),
                    detail="Print quality nominal." if passed else "Stringing detected!"
                )
                if not passed:
                    logger.warning("[fdm-sim] Job %s: vision check failed (phase 2)!", job_id)
                    await self._set_state(job_id, "ABORTED", "vision_check_failed")
                    return

            if i % 4 == 0:
                await self._add_media(
                    job_id, "camera.top",
                    f"https://via.placeholder.com/640x480.jpg?text=Layer+{i*5}%25",
                )

        # EXECUTING → FULFILLING → COMPLETED (M1: cooling and post-processing)
        await self._set_state(job_id, "FULFILLING", "cooling_and_post_processing")
        logger.info("[fdm-sim] Job %s — FULFILLING: cooling down", job_id)
        await asyncio.sleep(0.5)
        await self._set_state(job_id, "COMPLETED", "print_success")
        logger.info("[fdm-sim] Job %s COMPLETED successfully.", job_id)

    async def _emit_sensors(self, job_id: str, progress: float) -> None:
        await self._add_sensor(job_id, "extruder_temp", round(210 + random.uniform(-2, 2), 1), "degC")
        await self._add_sensor(job_id, "bed_temp", round(60 + random.uniform(-1, 1), 1), "degC")
        await self._add_sensor(job_id, "chamber_temp", round(35 + random.uniform(-1, 1), 1), "degC")
        await self._add_sensor(job_id, "layer_count", int(progress * 200), "layers")
        await self._add_sensor(job_id, "filament_used_g", round(progress * 38.2, 2), "g")


def create_adapter() -> FDMSimAdapter:
    return FDMSimAdapter()
