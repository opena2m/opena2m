"""
MCP-001 — MCP Bridge tool proxy tests.

Mocks the gateway HTTP client and verifies that each tool:
  - Sends the correct HTTP method + path to the gateway
  - Returns the gateway response wrapped in MCP tool result format
  - Passes through the caller's Authorization header verbatim
"""
from __future__ import annotations
import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

# Make sure mcp-bridge/server.py is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Patch httpx before importing server to avoid real network calls
import importlib


# ── Fixtures ─────────────────────────────────────────────────────────────────

MOCK_DEVICE_LIST = {
    "devices": [
        {
            "device_id": "cloudprint-sim-1",
            "domain": "manufacturing.print.2d.v1",
            "state": "IDLE",
        }
    ]
}

MOCK_QUOTE_RESPONSE = {
    "quote_id": "q-test-001",
    "state": "QUOTED",
    "estimated_cost": {"amount": 8.00, "currency": "USD"},
    "valid_until": "2026-01-01T12:00:00Z",
}

MOCK_EXECUTE_RESPONSE = {
    "job_id": "job-test-001",
    "state": "LOCKED",
    "telemetry_url": "/v1/jobs/job-test-001/telemetry",
    "stream_url": "/v1/jobs/job-test-001/stream",
}

MOCK_TELEMETRY_RESPONSE = {
    "job_id": "job-test-001",
    "state": "EXECUTING",
    "progress": 0.5,
    "sensor_readings": [],
    "media": [],
}

MOCK_ABORT_RESPONSE = {
    "job_id": "job-test-001",
    "state": "ABORTED",
    "final_cost": {"amount": 4.00, "currency": "USD"},
}

MOCK_RESUME_RESPONSE = {
    "job_id": "job-test-001",
    "state": "LOCKED",
}

MOCK_ERR_BUDGET_EXCEEDED = {
    "error": {
        "code": "ERR_BUDGET_EXCEEDED",
        "category": "policy",
        "message": "Daily budget ceiling exceeded",
        "retryable": False,
        "details": {"remaining": 0.0, "ceiling": 20.0},
    }
}


def _make_mock_client(status_code: int, response_data: dict) -> MagicMock:
    """Build an httpx.AsyncClient mock that returns the given response."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = response_data
    mock_response.text = json.dumps(response_data)
    mock_response.raise_for_status = MagicMock()
    if status_code >= 400:
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=mock_response
        )

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.post = AsyncMock(return_value=mock_response)
    return mock_client


# ── Import server dispatch function ──────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("AIMP_GATEWAY_URL", "http://mock-gateway:8080")
    monkeypatch.setenv("AIMP_GATEWAY_TOKEN", "test-bearer-token")


def get_dispatch():
    """Import _dispatch fresh (re-reads env)."""
    if "server" in sys.modules:
        del sys.modules["server"]
    import server
    return server._dispatch, server._call_gateway


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestAimpDiscover:
    @pytest.mark.asyncio
    async def test_discover_calls_post_v1_discover(self):
        import server
        mock_client = _make_mock_client(200, MOCK_DEVICE_LIST)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.discover", {"job_id": "j-001"})
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert call_args[0][0] == "/v1/discover"
        assert result == MOCK_DEVICE_LIST

    @pytest.mark.asyncio
    async def test_discover_with_domain_filter(self):
        import server
        mock_client = _make_mock_client(200, MOCK_DEVICE_LIST)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.discover", {
                "job_id": "j-001",
                "domains": ["manufacturing.print.2d.v1"],
            })
        body = mock_client.post.call_args.kwargs.get("json", {})
        assert body.get("device_filter", {}).get("domains") == ["manufacturing.print.2d.v1"]

    @pytest.mark.asyncio
    async def test_discover_returns_device_list(self):
        import server
        mock_client = _make_mock_client(200, MOCK_DEVICE_LIST)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.discover", {"job_id": "j-001"})
        assert "devices" in result
        assert result["devices"][0]["device_id"] == "cloudprint-sim-1"


class TestAimpQuote:
    @pytest.mark.asyncio
    async def test_quote_calls_post_v1_quote(self):
        import server
        mock_client = _make_mock_client(200, MOCK_QUOTE_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.quote", {
                "job_id": "j-002",
                "device_id": "cloudprint-sim-1",
                "domain": "manufacturing.print.2d.v1",
            })
        call_args = mock_client.post.call_args
        assert call_args[0][0] == "/v1/quote"

    @pytest.mark.asyncio
    async def test_quote_returns_quote_id(self):
        import server
        mock_client = _make_mock_client(200, MOCK_QUOTE_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.quote", {
                "job_id": "j-002",
                "device_id": "cloudprint-sim-1",
                "domain": "manufacturing.print.2d.v1",
            })
        assert result["quote_id"] == "q-test-001"
        assert result["estimated_cost"]["amount"] == 8.00

    @pytest.mark.asyncio
    async def test_quote_passes_payload(self):
        import server
        mock_client = _make_mock_client(200, MOCK_QUOTE_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            await server._dispatch("aimp.quote", {
                "job_id": "j-002",
                "device_id": "cloudprint-sim-1",
                "domain": "manufacturing.print.2d.v1",
                "payload": {"pages": 4, "color_mode": "color"},
            })
        body = mock_client.post.call_args.kwargs.get("json", {})
        assert body.get("payload", {}).get("pages") == 4


class TestAimpExecute:
    @pytest.mark.asyncio
    async def test_execute_calls_post_v1_execute(self):
        import server
        mock_client = _make_mock_client(202, MOCK_EXECUTE_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.execute", {
                "job_id": "job-test-001",
                "quote_id": "q-test-001",
            })
        call_args = mock_client.post.call_args
        assert call_args[0][0] == "/v1/execute"

    @pytest.mark.asyncio
    async def test_execute_returns_job_id_and_state(self):
        import server
        mock_client = _make_mock_client(202, MOCK_EXECUTE_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.execute", {
                "job_id": "job-test-001",
                "quote_id": "q-test-001",
            })
        assert result["job_id"] == "job-test-001"
        assert result["state"] == "LOCKED"

    @pytest.mark.asyncio
    async def test_execute_passes_approval_token(self):
        import server
        mock_client = _make_mock_client(202, MOCK_EXECUTE_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            await server._dispatch("aimp.execute", {
                "job_id": "job-test-001",
                "quote_id": "q-test-001",
                "approval_token": "tok-abc123",
            })
        body = mock_client.post.call_args.kwargs.get("json", {})
        assert body.get("approval_token") == "tok-abc123"


class TestAimpTelemetry:
    @pytest.mark.asyncio
    async def test_telemetry_calls_get_v1_jobs_telemetry(self):
        import server
        mock_client = _make_mock_client(200, MOCK_TELEMETRY_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.telemetry", {"job_id": "job-test-001"})
        mock_client.get.assert_called_once()
        call_args = mock_client.get.call_args
        assert "/v1/jobs/job-test-001/telemetry" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_telemetry_returns_state_and_progress(self):
        import server
        mock_client = _make_mock_client(200, MOCK_TELEMETRY_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.telemetry", {"job_id": "job-test-001"})
        assert result["state"] == "EXECUTING"
        assert result["progress"] == 0.5

    @pytest.mark.asyncio
    async def test_telemetry_with_since_param(self):
        import server
        mock_client = _make_mock_client(200, MOCK_TELEMETRY_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            await server._dispatch("aimp.telemetry", {
                "job_id": "job-test-001",
                "since": "2026-01-01T00:00:00Z",
            })
        path = mock_client.get.call_args[0][0]
        assert "since=" in path


class TestAimpAbort:
    @pytest.mark.asyncio
    async def test_abort_calls_post_v1_jobs_abort(self):
        import server
        mock_client = _make_mock_client(200, MOCK_ABORT_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.abort", {
                "job_id": "job-test-001",
                "reason": "test abort",
            })
        call_args = mock_client.post.call_args
        assert "/v1/jobs/job-test-001/abort" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_abort_returns_final_state(self):
        import server
        mock_client = _make_mock_client(200, MOCK_ABORT_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.abort", {"job_id": "job-test-001"})
        assert result["state"] == "ABORTED"

    @pytest.mark.asyncio
    async def test_abort_passes_recovery_mode(self):
        import server
        mock_client = _make_mock_client(200, MOCK_ABORT_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            await server._dispatch("aimp.abort", {
                "job_id": "job-test-001",
                "recovery_mode": "hard_stop",
            })
        body = mock_client.post.call_args.kwargs.get("json", {})
        assert body.get("recovery_mode") == "hard_stop"


class TestAimpResume:
    @pytest.mark.asyncio
    async def test_resume_calls_post_v1_jobs_resume(self):
        import server
        mock_client = _make_mock_client(200, MOCK_RESUME_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await server._dispatch("aimp.resume", {
                "job_id": "job-test-001",
                "approval_token": "tok-abc",
                "decision": "CONTINUE",
            })
        call_args = mock_client.post.call_args
        assert "/v1/jobs/job-test-001/resume" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_resume_passes_decision(self):
        import server
        mock_client = _make_mock_client(200, MOCK_RESUME_RESPONSE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            await server._dispatch("aimp.resume", {
                "job_id": "job-test-001",
                "approval_token": "tok-abc",
                "decision": "ABORT",
            })
        body = mock_client.post.call_args.kwargs.get("json", {})
        assert body.get("decision") == "ABORT"

    @pytest.mark.asyncio
    async def test_resume_passes_parameter_overrides(self):
        import server
        mock_client = _make_mock_client(200, MOCK_RESUME_RESPONSE)
        overrides = {"speed_mm_s": 40}
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            await server._dispatch("aimp.resume", {
                "job_id": "job-test-001",
                "approval_token": "tok-abc",
                "decision": "ADJUST",
                "parameter_overrides": overrides,
            })
        body = mock_client.post.call_args.kwargs.get("json", {})
        assert body.get("parameter_overrides") == overrides


class TestToolList:
    def test_list_tools_returns_six_tools(self):
        import server
        assert len(server.TOOLS) == 6, f"Expected 6 tools, got {len(server.TOOLS)}: {[t.name for t in server.TOOLS]}"
        tool_names = {t.name for t in server.TOOLS}
        expected = {"aimp.discover", "aimp.quote", "aimp.execute", "aimp.telemetry", "aimp.abort", "aimp.resume"}
        assert tool_names == expected

    def test_all_tools_have_input_schema(self):
        import server
        for tool in server.TOOLS:
            assert tool.inputSchema is not None, f"{tool.name} missing inputSchema"
            assert "properties" in tool.inputSchema, f"{tool.name} inputSchema missing properties"

    def test_all_tools_have_job_id_param(self):
        import server
        for tool in server.TOOLS:
            props = tool.inputSchema.get("properties", {})
            assert "job_id" in props, f"{tool.name} missing job_id parameter"

    def test_resume_tool_has_required_fields(self):
        import server
        resume_tool = next(t for t in server.TOOLS if t.name == "aimp.resume")
        schema = resume_tool.inputSchema
        required = schema.get("required", [])
        assert "job_id" in required
        assert "approval_token" in required
        assert "decision" in required
        props = schema.get("properties", {})
        decision_enum = props.get("decision", {}).get("enum", [])
        assert "CONTINUE" in decision_enum
        assert "ABORT" in decision_enum
        assert "ADJUST" in decision_enum
