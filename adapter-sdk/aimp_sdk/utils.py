"""
AIMP Adapter SDK — utility helpers for adapter authors.

These helpers reduce boilerplate in simulator and real adapters alike.
"""
from __future__ import annotations

import asyncio
import logging
import math
from typing import Any, Optional

logger = logging.getLogger("aimp.sdk.utils")


async def simulate_progress(
    adapter: Any,
    job_id: str,
    duration_s: float,
    interval_s: float = 1.0,
    start: float = 0.0,
    end: float = 1.0,
    speed_factor: float = 1.0,
) -> None:
    """
    Emit progress updates from `start` to `end` over `duration_s` seconds.

    Useful for simulator adapters. The `speed_factor` parameter speeds up
    the simulation (e.g. FDM_SIM_SPEED_FACTOR=100 makes a 60-min job run
    in ~36 seconds).

    Example:
        await simulate_progress(self, job_id, duration_s=60.0, speed_factor=100)
    """
    if speed_factor <= 0:
        raise ValueError(f"speed_factor must be > 0, got {speed_factor}")

    effective_duration = duration_s / speed_factor
    effective_interval = max(0.05, interval_s / speed_factor)
    steps = max(1, math.ceil(effective_duration / effective_interval))
    step_progress = (end - start) / steps

    progress = start
    for i in range(steps):
        progress = min(end, start + step_progress * (i + 1))
        await adapter._set_progress(job_id, round(progress, 4))
        if i < steps - 1:
            await asyncio.sleep(effective_interval)

    # Ensure we always hit exactly 1.0 if end==1.0
    if end >= 1.0 and progress < 1.0:
        await adapter._set_progress(job_id, 1.0)


async def simulate_sensors(
    adapter: Any,
    job_id: str,
    channels: dict[str, tuple[float, float]],
    duration_s: float,
    interval_s: float = 10.0,
    speed_factor: float = 1.0,
) -> None:
    """
    Emit sensor readings for multiple channels over `duration_s` seconds.

    `channels` maps channel name → (base_value, noise_amplitude).
    Values oscillate around base_value ± noise_amplitude using a sine wave.

    Example:
        await simulate_sensors(self, job_id, {
            "extruder_temp": (215.0, 2.0),
            "chamber.temp": (45.0, 1.0),
        }, duration_s=300)
    """
    import random

    effective_duration = duration_s / speed_factor
    effective_interval = max(0.05, interval_s / speed_factor)
    steps = max(1, math.ceil(effective_duration / effective_interval))

    for i in range(steps):
        t = i / max(steps - 1, 1)  # 0.0 → 1.0
        for channel, (base, noise) in channels.items():
            value = round(base + noise * math.sin(t * math.pi * 4) + random.uniform(-noise * 0.1, noise * 0.1), 2)
            await adapter._add_sensor(job_id, channel, value)
        await asyncio.sleep(effective_interval)


async def emit_camera_snapshot(
    adapter: Any,
    job_id: str,
    channel: str = "camera.top",
    url_template: str = "sim://camera/{job_id}/{channel}/{n}",
    n: int = 0,
) -> None:
    """
    Emit a simulated camera snapshot (placeholder URL).
    For real adapters, replace with actual image upload logic.
    """
    url = url_template.format(job_id=job_id, channel=channel, n=n)
    await adapter._add_media(job_id, channel, url, "image/jpeg")


def clamp(value: float, lo: float, hi: float) -> float:
    """Clamp value to [lo, hi]."""
    return max(lo, min(hi, value))


def validate_parameter_bounds(
    overrides: dict[str, Any],
    bounds: dict[str, tuple[float, float]],
) -> list[str]:
    """
    Validate that override values stay within declared bounds.

    Returns a list of error strings (empty if all valid).

    Example:
        errors = validate_parameter_bounds(
            {"nozzle_temp_celsius": 260},
            {"nozzle_temp_celsius": (170, 250)},
        )
        # → ["nozzle_temp_celsius=260 exceeds max 250"]
    """
    errors: list[str] = []
    for key, value in overrides.items():
        if key in bounds:
            lo, hi = bounds[key]
            if not (lo <= value <= hi):
                errors.append(f"{key}={value} out of bounds [{lo}, {hi}]")
    return errors
