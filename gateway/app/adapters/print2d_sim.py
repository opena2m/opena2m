"""
Reference adapter: manufacturing.print.2d.v1
Simulates a cloud 2D print job with shipping webhook.
Risk tier: routine — happy-path, no HITL.
"""
from __future__ import annotations
import asyncio
import logging
import random

from app.adapters import BaseAdapter

logger = logging.getLogger("aimp.adapter.print2d_sim")

DOMAIN_ID = "manufacturing.print.2d.v1"
DEVICE_ID = "cloudprint-sim-1"


class Print2DSimAdapter(BaseAdapter):
    domain_id = DOMAIN_ID
    version = "0.1.0"
    display_name = "Cloud 2D Print Simulator"

    async def compute_quote(self, device_id, payload, asset=None, logistics=None):
        pages = payload.get("pages", 1)
        color = payload.get("color_mode", "color") == "color"
        copies = payload.get("copies", 1)

        material_cost = round(0.05 * pages * copies * (2 if color else 1), 2)
        logistics_cost = round((logistics or {}).get("shipping_cost_override", 3.50), 2)
        service_fee = 0.50
        total = round(material_cost + logistics_cost + service_fee, 2)
        machine_seconds = pages * copies * 4

        return {
            "cost": {
                "currency": "USD",
                "amount": total,
                "breakdown": {
                    "material": material_cost,
                    "machine_time": 0.0,
                    "logistics": logistics_cost,
                    "service_fee": service_fee,
                },
            },
            "resource_consumption": {
                "material": [{"name": "paper_A4", "quantity": pages * copies, "unit": "sheets"}],
                "machine_time_seconds": machine_seconds,
                "energy_kwh": round(machine_seconds * 0.0001, 4),
            },
        }

    def get_consumables(self, device_id):
        return [
            {"name": "paper_A4", "quantity": 500, "unit": "sheets"},
            {"name": "ink_cyan", "quantity": 80.0, "unit": "ml"},
            {"name": "ink_magenta", "quantity": 75.0, "unit": "ml"},
            {"name": "ink_yellow", "quantity": 82.0, "unit": "ml"},
            {"name": "ink_black", "quantity": 60.0, "unit": "ml"},
        ]

    async def execute(self, job_id, device_id, audit_requirements=None):
        audit_requirements = audit_requirements or {}
        snapshot_interval = audit_requirements.get("snapshot_interval_seconds", 10)

        logger.info("[print2d-sim] Starting job %s on %s", job_id, device_id)

        # LOCKED → EXECUTING
        await self._set_state(job_id, "EXECUTING", "print_started")

        # Simulate print progress over ~8 seconds
        steps = 10
        for i in range(1, steps + 1):
            await asyncio.sleep(0.8)
            progress = i / steps
            await self._set_progress(job_id, progress)

            # Sensor readings
            await self._add_sensor(job_id, "printer.temperature", round(38.5 + random.uniform(-1, 1), 1), "degC")
            await self._add_sensor(job_id, "printer.ink_level", round(60 - i * 0.5, 1), "%")

            # Snapshot at interval
            if i % max(1, snapshot_interval // 1) == 0:
                await self._add_media(
                    job_id,
                    "camera.top",
                    f"https://via.placeholder.com/640x480.jpg?text=Print+{int(progress*100)}%25",
                )
            logger.info("[print2d-sim] Job %s progress %.0f%%", job_id, progress * 100)

        # EXECUTING → FULFILLING
        await self._set_state(job_id, "FULFILLING", "print_complete_packaging")
        await asyncio.sleep(0.5)

        # Simulate shipping dispatch
        tracking = f"SIM-{job_id[:8].upper()}"
        logger.info("[print2d-sim] Job %s shipped. Tracking: %s", job_id, tracking)
        await self._add_sensor(job_id, "shipping.tracking_number", tracking, "")

        # FULFILLING → COMPLETED
        await self._set_state(job_id, "COMPLETED", "shipped")
        logger.info("[print2d-sim] Job %s COMPLETED", job_id)


def create_adapter() -> Print2DSimAdapter:
    return Print2DSimAdapter()
