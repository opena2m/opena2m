"""
AIMP Adapter SDK — MockJobContext for unit testing adapters.

Usage in tests:
    from aimp_sdk.mock_context import MockJobContext
    from mypackage.my_adapter import MyAdapter

    async def test_quote():
        ctx = MockJobContext("job-001", "device-1")
        adapter = MyAdapter()
        result = await adapter.compute_quote(ctx.device_id, {"pages": 1})
        assert result["cost"]["amount"] > 0

    async def test_execute():
        ctx = MockJobContext("job-001", "device-1")
        adapter = MyAdapter()
        await adapter.execute(ctx.job_id, ctx.device_id)
        assert ctx.final_state == "COMPLETED"
        assert ctx.progress_history[-1] == 1.0
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("aimp.sdk.mock")


@dataclass
class _SensorCall:
    channel: str
    value: Any
    unit: str


@dataclass
class _MediaCall:
    channel: str
    url: str
    mime: str


@dataclass
class _VisionCall:
    name: str
    passed: bool
    confidence: float
    detail: str


@dataclass
class _PauseCall:
    waypoint: str
    reason: str


class MockJobContext:
    """
    In-memory implementation of the gateway callbacks used by BaseAdapter.

    Records every emit_* call for assertion in tests. By default the mock
    auto-resumes human pauses with CONTINUE — set `pause_decision` to change.

    All BaseAdapter._set_state / _add_sensor / etc. delegate to these when
    running outside the gateway (ImportError branch in base.py). To use this
    mock you can also subclass your adapter and override the callbacks directly,
    or patch the gateway's AsyncSessionLocal import.
    """

    def __init__(
        self,
        job_id: str,
        device_id: str,
        pause_decision: str = "CONTINUE",
        audit_requirements: Optional[Dict[str, Any]] = None,
    ):
        self.job_id = job_id
        self.device_id = device_id
        self.pause_decision = pause_decision
        self.audit_requirements: Dict[str, Any] = audit_requirements or {}

        # ── Recorded calls ───────────────────────────────────────────────────
        self.state_history: List[str] = []
        self.progress_history: List[float] = []
        self.sensor_calls: List[_SensorCall] = []
        self.media_calls: List[_MediaCall] = []
        self.vision_calls: List[_VisionCall] = []
        self.pause_calls: List[_PauseCall] = []

        # ── Derived helpers ──────────────────────────────────────────────────
        self._paused = asyncio.Event()
        self._resumed = asyncio.Event()
        self._resume_decision: Optional[str] = None
        self._resume_overrides: Dict[str, Any] = {}

    # ── State ────────────────────────────────────────────────────────────────

    @property
    def final_state(self) -> Optional[str]:
        return self.state_history[-1] if self.state_history else None

    @property
    def is_aborted(self) -> bool:
        return self.final_state == "ABORTED"

    @property
    def is_completed(self) -> bool:
        return self.final_state == "COMPLETED"

    # ── BaseAdapter gateway callbacks ────────────────────────────────────────
    # These are called by the patched _set_state etc. in tests.

    async def set_state(self, state: str, reason: str = "") -> None:
        logger.debug("[mock] state → %s (%s)", state, reason)
        self.state_history.append(state)

    async def set_progress(self, progress: float) -> None:
        logger.debug("[mock] progress → %.0f%%", progress * 100)
        self.progress_history.append(progress)

    async def add_sensor(self, channel: str, value: Any, unit: str = "") -> None:
        logger.debug("[mock] sensor %s = %s %s", channel, value, unit)
        self.sensor_calls.append(_SensorCall(channel=channel, value=value, unit=unit))

    async def add_media(self, channel: str, url: str, mime: str = "image/jpeg") -> None:
        logger.debug("[mock] media %s → %s", channel, url)
        self.media_calls.append(_MediaCall(channel=channel, url=url, mime=mime))

    async def add_vision_check(
        self, name: str, passed: bool, confidence: float = 1.0, detail: str = ""
    ) -> None:
        logger.debug("[mock] vision %s → %s (%.0f%%)", name, "PASS" if passed else "FAIL", confidence * 100)
        self.vision_calls.append(_VisionCall(name=name, passed=passed, confidence=confidence, detail=detail))

    async def request_human_pause(self, waypoint: str, reason: str = "") -> str:
        """
        Simulates a HITL pause. Returns the configured `pause_decision`.
        If pause_decision is CONTINUE (default) the mock resumes immediately.
        """
        logger.debug("[mock] human pause at waypoint '%s'", waypoint)
        self.pause_calls.append(_PauseCall(waypoint=waypoint, reason=reason))
        self.state_history.append("AUDITING")
        # Simulate brief pause then auto-resume
        await asyncio.sleep(0)
        return self.pause_decision

    # ── Patch helpers for use with adapters that call self._set_state etc. ───

    def patch_adapter(self, adapter: Any) -> None:
        """
        Monkey-patches an adapter instance so its internal callbacks write
        to this mock context instead of trying to import gateway internals.

        Example:
            ctx = MockJobContext("job-1", "device-1")
            adapter = MyAdapter()
            ctx.patch_adapter(adapter)
            await adapter.execute("job-1", "device-1")
            assert ctx.is_completed
        """
        import functools

        async def _patched_set_state(job_id: str, state: str, reason: str = "") -> None:
            await self.set_state(state, reason)

        async def _patched_set_progress(job_id: str, progress: float) -> None:
            await self.set_progress(progress)

        async def _patched_add_sensor(job_id: str, channel: str, value: Any, unit: str = "") -> None:
            await self.add_sensor(channel, value, unit)

        async def _patched_add_media(job_id: str, channel: str, url: str, mime: str = "image/jpeg") -> None:
            await self.add_media(channel, url, mime)

        async def _patched_add_vision_check(
            job_id: str, name: str, passed: bool, confidence: float = 1.0, detail: str = ""
        ) -> None:
            await self.add_vision_check(name, passed, confidence, detail)

        async def _patched_request_human_pause(job_id: str, waypoint: str, reason: str = "") -> str:
            return await self.request_human_pause(waypoint, reason)

        adapter._set_state = _patched_set_state
        adapter._set_progress = _patched_set_progress
        adapter._add_sensor = _patched_add_sensor
        adapter._add_media = _patched_add_media
        adapter._add_vision_check = _patched_add_vision_check
        # Some adapters call request_human_pause directly on self
        if hasattr(adapter, "request_human_pause"):
            adapter.request_human_pause = functools.partial(
                lambda waypoint, reason="": self.request_human_pause(waypoint, reason)
            )

    # ── Assertion helpers ────────────────────────────────────────────────────

    def assert_state_sequence(self, *expected_states: str) -> None:
        """Assert the adapter passed through exactly these states in order."""
        actual = self.state_history
        assert actual == list(expected_states), (
            f"State sequence mismatch.\n  Expected: {list(expected_states)}\n  Actual:   {actual}"
        )

    def assert_sensor_emitted(self, channel: str) -> None:
        channels = [s.channel for s in self.sensor_calls]
        assert channel in channels, f"Sensor '{channel}' never emitted. Got: {channels}"

    def assert_vision_emitted(self, name: str, *, passed: Optional[bool] = None) -> None:
        names = [v.name for v in self.vision_calls]
        assert name in names, f"Vision check '{name}' never emitted. Got: {names}"
        if passed is not None:
            result = next(v for v in self.vision_calls if v.name == name)
            assert result.passed == passed, (
                f"Vision check '{name}' passed={result.passed}, expected passed={passed}"
            )

    def assert_media_emitted(self, channel: str) -> None:
        channels = [m.channel for m in self.media_calls]
        assert channel in channels, f"Media '{channel}' never emitted. Got: {channels}"

    def assert_paused_at(self, waypoint: str) -> None:
        waypoints = [p.waypoint for p in self.pause_calls]
        assert waypoint in waypoints, f"No pause at '{waypoint}'. Got: {waypoints}"
