"""Run the compliance suite against built-in reference adapters."""
import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'gateway'))
os.environ.setdefault("AIMP_JWT_SECRET", "test-secret")
os.environ.setdefault("AIMP_DEV", "true")

from tests.compliance import TestAdapterCompliance, _patch_adapter_callbacks, _MockGateway


class TestPrint2DCompliance(TestAdapterCompliance):
    @pytest.fixture
    def adapter(self):
        from app.adapters.print2d_sim import create_adapter
        return create_adapter()


class TestFDMCompliance(TestAdapterCompliance):
    @pytest.fixture
    def adapter(self):
        from app.adapters.fdm_sim import create_adapter
        return create_adapter()

    @pytest.mark.asyncio
    async def test_fdm_sensor_channels_emitted(self, adapter):
        """FDM adapter must emit extruder_temp and bed_temp sensors."""
        mock = _MockGateway()
        _patch_adapter_callbacks(adapter, mock)
        await adapter.execute(
            job_id="fdm-compliance-sensors",
            device_id="fdm-sim-1",
            audit_requirements={"pause_for_human_at": []},  # no HITL pause
        )
        channels = {s["channel"] for s in mock.sensors}
        assert "extruder_temp" in channels, "FDM must emit extruder_temp"
        assert "bed_temp" in channels, "FDM must emit bed_temp"

    @pytest.mark.asyncio
    async def test_fdm_vision_check_emitted(self, adapter):
        """FDM adapter emits vision checks when requested."""
        mock = _MockGateway()
        _patch_adapter_callbacks(adapter, mock)
        await adapter.execute(
            job_id="fdm-compliance-vision",
            device_id="fdm-sim-1",
            audit_requirements={
                "ai_vision_checks": ["detect_spaghetti_failure"],
                "pause_for_human_at": [],
            },
        )
        assert len(mock.vision_checks) > 0, "FDM adapter must emit vision checks when requested"
        names = {v["name"] for v in mock.vision_checks}
        assert "detect_spaghetti_failure" in names
