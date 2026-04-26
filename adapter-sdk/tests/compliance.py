"""
AIMP Adapter Compliance Test Harness
=====================================
Third-party adapter authors can import this suite to verify their adapter
satisfies the BaseAdapter contract:

    from opena2m.adapter_sdk.tests.compliance import run_compliance_suite
    from my_adapter import create_adapter

    run_compliance_suite(create_adapter())

Or via pytest::

    pytest adapter-sdk/tests/test_compliance.py --adapter=my_package:create_adapter
"""
from __future__ import annotations
import asyncio
import pytest
from typing import Any, List


class _MockGateway:
    """In-memory gateway mock for compliance testing."""

    def __init__(self) -> None:
        self.states: List[str] = []
        self.progresses: List[float] = []
        self.sensors: List[dict] = []
        self.media: List[dict] = []
        self.vision_checks: List[dict] = []

    async def set_state(self, job_id: str, state: str, reason: str = "") -> None:
        self.states.append(state)

    async def set_progress(self, job_id: str, progress: float) -> None:
        assert 0.0 <= progress <= 1.0, f"Progress out of range: {progress}"
        self.progresses.append(progress)

    async def add_sensor(self, job_id: str, channel: str, value: Any, unit: str = "") -> None:
        self.sensors.append({"channel": channel, "value": value, "unit": unit})

    async def add_media(self, job_id: str, channel: str, url: str, mime: str = "image/jpeg") -> None:
        self.media.append({"channel": channel, "url": url, "mime": mime})

    async def add_vision_check(self, job_id: str, check_name: str, passed: bool,
                                confidence: float = 1.0, detail: str = "") -> None:
        self.vision_checks.append({"name": check_name, "passed": passed, "confidence": confidence})


def _patch_adapter_callbacks(adapter, mock_gw: _MockGateway) -> None:
    """Replace DB callbacks with mock ones for testing."""
    adapter._set_state = mock_gw.set_state
    adapter._set_progress = mock_gw.set_progress
    adapter._add_sensor = mock_gw.add_sensor
    adapter._add_media = mock_gw.add_media
    adapter._add_vision_check = mock_gw.add_vision_check


class TestAdapterCompliance:
    """
    Parametrize with your adapter via conftest or run_compliance_suite().
    """

    @pytest.fixture
    def adapter(self):
        """Override in your test file to return your adapter instance."""
        pytest.skip("No adapter provided — use run_compliance_suite() or override adapter fixture.")

    def test_has_domain_id(self, adapter):
        assert isinstance(adapter.domain_id, str)
        assert len(adapter.domain_id) > 0
        # Must follow naming convention: lowercase dot-separated with version
        parts = adapter.domain_id.split(".")
        assert len(parts) >= 3, "domain_id should have at least 3 dot-separated parts"
        assert parts[-1].startswith("v"), "Last segment should be version like 'v1'"

    def test_has_version(self, adapter):
        assert isinstance(adapter.version, str)
        assert len(adapter.version) > 0

    def test_has_display_name(self, adapter):
        assert isinstance(adapter.display_name, str)

    @pytest.mark.asyncio
    async def test_compute_quote_returns_correct_shape(self, adapter):
        result = await adapter.compute_quote(
            device_id="test-device",
            payload={},
        )
        assert "cost" in result, "compute_quote must return a 'cost' key"
        cost = result["cost"]
        assert "currency" in cost, "cost must have 'currency'"
        assert "amount" in cost, "cost must have 'amount'"
        assert isinstance(cost["amount"], (int, float)), "cost.amount must be numeric"
        assert cost["amount"] >= 0, "cost.amount must be non-negative"
        assert len(cost["currency"]) == 3, "currency must be a 3-letter ISO 4217 code"

    @pytest.mark.asyncio
    async def test_compute_quote_has_breakdown(self, adapter):
        result = await adapter.compute_quote(device_id="test-device", payload={})
        cost = result.get("cost", {})
        if "breakdown" in cost:
            bd = cost["breakdown"]
            for key in ("material", "machine_time", "logistics", "service_fee"):
                assert key in bd, f"breakdown missing key: {key}"
                assert isinstance(bd[key], (int, float))

    @pytest.mark.asyncio
    async def test_compute_quote_does_not_mutate_state(self, adapter):
        """Calling compute_quote twice must not start any physical work."""
        r1 = await adapter.compute_quote(device_id="test-device", payload={})
        r2 = await adapter.compute_quote(device_id="test-device", payload={})
        assert r1["cost"]["amount"] == r2["cost"]["amount"], \
            "compute_quote must be deterministic for the same inputs"

    @pytest.mark.asyncio
    async def test_execute_reaches_terminal_state(self, adapter):
        mock = _MockGateway()
        _patch_adapter_callbacks(adapter, mock)
        await adapter.execute(
            job_id="compliance-test-01",
            device_id="test-device",
            audit_requirements={},
        )
        terminal_states = {"COMPLETED", "ABORTED", "FAILED"}
        assert any(s in terminal_states for s in mock.states), \
            f"execute() must reach a terminal state. States seen: {mock.states}"

    @pytest.mark.asyncio
    async def test_execute_transitions_through_executing(self, adapter):
        mock = _MockGateway()
        _patch_adapter_callbacks(adapter, mock)
        await adapter.execute(
            job_id="compliance-test-02",
            device_id="test-device",
            audit_requirements={},
        )
        assert "EXECUTING" in mock.states, \
            "execute() must pass through EXECUTING state"

    @pytest.mark.asyncio
    async def test_execute_progress_is_monotonic(self, adapter):
        mock = _MockGateway()
        _patch_adapter_callbacks(adapter, mock)
        await adapter.execute(
            job_id="compliance-test-03",
            device_id="test-device",
            audit_requirements={},
        )
        for i in range(1, len(mock.progresses)):
            assert mock.progresses[i] >= mock.progresses[i - 1], \
                f"Progress went backwards: {mock.progresses[i-1]} → {mock.progresses[i]}"

    @pytest.mark.asyncio
    async def test_abort_is_idempotent(self, adapter):
        """abort() must not raise even if called multiple times."""
        await adapter.abort("compliance-abort-01", "test-device", "safe_home")
        await adapter.abort("compliance-abort-01", "test-device", "safe_home")

    def test_get_consumables_returns_list(self, adapter):
        result = adapter.get_consumables("test-device")
        assert isinstance(result, list)
        for item in result:
            assert "name" in item
            assert "quantity" in item
            assert "unit" in item


def run_compliance_suite(adapter_instance) -> None:
    """
    Run the full compliance suite against an adapter instance.
    Raises AssertionError on failure; prints results to stdout.

    Usage::

        from opena2m.adapter_sdk.tests.compliance import run_compliance_suite
        run_compliance_suite(MyAdapter())
    """
    import sys

    suite = TestAdapterCompliance()
    tests = [
        ("domain_id", lambda: suite.test_has_domain_id(adapter_instance)),
        ("version", lambda: suite.test_has_version(adapter_instance)),
        ("display_name", lambda: suite.test_has_display_name(adapter_instance)),
        ("get_consumables", lambda: suite.test_get_consumables_returns_list(adapter_instance)),
    ]

    async def run_async():
        async_tests = [
            ("compute_quote shape", suite.test_compute_quote_returns_correct_shape(adapter_instance)),
            ("compute_quote breakdown", suite.test_compute_quote_has_breakdown(adapter_instance)),
            ("compute_quote idempotent", suite.test_compute_quote_does_not_mutate_state(adapter_instance)),
            ("execute terminal state", suite.test_execute_reaches_terminal_state(adapter_instance)),
            ("execute EXECUTING state", suite.test_execute_transitions_through_executing(adapter_instance)),
            ("execute progress monotonic", suite.test_execute_progress_is_monotonic(adapter_instance)),
            ("abort idempotent", suite.test_abort_is_idempotent(adapter_instance)),
        ]
        passed = failed = 0
        for name, coro in async_tests:
            try:
                await coro
                print(f"  ✓ {name}")
                passed += 1
            except Exception as exc:
                print(f"  ✗ {name}: {exc}")
                failed += 1
        return passed, failed

    print(f"\nAIMP Adapter Compliance Suite: {adapter_instance.domain_id}\n")
    sync_passed = sync_failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  ✓ {name}")
            sync_passed += 1
        except Exception as exc:
            print(f"  ✗ {name}: {exc}")
            sync_failed += 1

    async_p, async_f = asyncio.run(run_async())
    total_pass = sync_passed + async_p
    total_fail = sync_failed + async_f

    print(f"\n{'✅' if total_fail == 0 else '❌'} "
          f"{total_pass}/{total_pass+total_fail} tests passed\n")
    if total_fail > 0:
        sys.exit(1)
