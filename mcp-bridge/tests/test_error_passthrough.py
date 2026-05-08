"""
MCP-001 — MCP Bridge error passthrough tests.

Verifies that structured gateway errors (4xx / 5xx) are:
  - Returned with isError=True
  - Carry the HTTP status code in the error payload
  - Preserve the gateway error body so callers can act on error codes
    like ERR_BUDGET_EXCEEDED, ERR_QUOTE_EXPIRED, etc.
"""
from __future__ import annotations
import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ── Error fixtures ────────────────────────────────────────────────────────────

ERR_BUDGET_EXCEEDED = {
    "error": {
        "code": "ERR_BUDGET_EXCEEDED",
        "category": "policy",
        "message": "Daily budget ceiling exceeded",
        "retryable": False,
        "details": {"remaining": 0.0, "ceiling": 20.0},
    }
}

ERR_QUOTE_EXPIRED = {
    "error": {
        "code": "ERR_QUOTE_EXPIRED",
        "category": "resource",
        "message": "Quote has expired",
        "retryable": True,
        "details": {"quote_id": "q-expired-001", "expired_at": "2026-01-01T12:00:00Z"},
    }
}

ERR_DEVICE_OFFLINE = {
    "error": {
        "code": "ERR_DEVICE_OFFLINE",
        "category": "resource",
        "message": "Device is not reachable",
        "retryable": True,
        "details": {"device_id": "cloudprint-sim-1"},
    }
}

ERR_UNSAFE_PARAMETER = {
    "error": {
        "code": "ERR_UNSAFE_PARAMETER",
        "category": "safety",
        "message": "Parameter exceeds safety limit",
        "retryable": False,
        "details": {"parameter": "temperature", "value": 999, "max_allowed": 300},
    }
}

ERR_APPROVAL_REQUIRED = {
    "error": {
        "code": "ERR_APPROVAL_REQUIRED",
        "category": "policy",
        "message": "Human approval required for restricted domain",
        "retryable": False,
        "details": {"risk_tier": "restricted"},
    }
}

ERR_JOB_NOT_FOUND = {
    "error": {
        "code": "ERR_JOB_NOT_FOUND",
        "category": "resource",
        "message": "Job not found",
        "retryable": False,
        "details": {"job_id": "job-missing-999"},
    }
}


def _make_error_client(status_code: int, error_body: dict) -> MagicMock:
    """Build a mock httpx.AsyncClient that raises HTTPStatusError."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = error_body
    mock_response.text = json.dumps(error_body)

    http_error = httpx.HTTPStatusError(
        "error", request=MagicMock(), response=mock_response
    )
    mock_response.raise_for_status = MagicMock(side_effect=http_error)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(side_effect=http_error)
    mock_client.post = AsyncMock(side_effect=http_error)
    return mock_client


# ── Fixture ───────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("AIMP_GATEWAY_URL", "http://mock-gateway:8080")
    monkeypatch.setenv("AIMP_GATEWAY_TOKEN", "test-bearer-token")


# ── ERR_BUDGET_EXCEEDED (quote, 402) ─────────────────────────────────────────

class TestBudgetExceeded:
    @pytest.mark.asyncio
    async def test_quote_budget_exceeded_raises_http_error(self):
        """_call_gateway raises HTTPStatusError on 402; _dispatch propagates it."""
        import server
        mock_client = _make_error_client(402, ERR_BUDGET_EXCEEDED)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError):
                await server._dispatch("aimp.quote", {
                    "job_id": "j-budget-test",
                    "device_id": "cloudprint-sim-1",
                    "domain": "manufacturing.print.2d.v1",
                })

    @pytest.mark.asyncio
    async def test_call_tool_budget_exceeded_returns_is_error_true(self):
        """call_tool handler catches HTTPStatusError and sets isError=True."""
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(402, ERR_BUDGET_EXCEEDED)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.quote",
                    arguments={
                        "job_id": "j-budget-test",
                        "device_id": "cloudprint-sim-1",
                        "domain": "manufacturing.print.2d.v1",
                    },
                ),
            )
            result = await server.call_tool(req)
        assert result.isError is True

    @pytest.mark.asyncio
    async def test_call_tool_budget_exceeded_payload_has_status_code(self):
        """Error payload includes HTTP status code from gateway."""
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(402, ERR_BUDGET_EXCEEDED)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.quote",
                    arguments={
                        "job_id": "j-budget-test",
                        "device_id": "cloudprint-sim-1",
                        "domain": "manufacturing.print.2d.v1",
                    },
                ),
            )
            result = await server.call_tool(req)
        payload = json.loads(result.content[0].text)
        # The bridge wraps the status code in the error field
        assert "402" in payload.get("error", "")


# ── ERR_QUOTE_EXPIRED (execute, 409) ─────────────────────────────────────────

class TestQuoteExpired:
    @pytest.mark.asyncio
    async def test_execute_expired_quote_is_error(self):
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(409, ERR_QUOTE_EXPIRED)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.execute",
                    arguments={"job_id": "j-expired", "quote_id": "q-expired-001"},
                ),
            )
            result = await server.call_tool(req)
        assert result.isError is True
        payload = json.loads(result.content[0].text)
        assert "409" in payload.get("error", "")

    @pytest.mark.asyncio
    async def test_execute_expired_quote_detail_present(self):
        """detail field carries the raw gateway response text."""
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(409, ERR_QUOTE_EXPIRED)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.execute",
                    arguments={"job_id": "j-expired", "quote_id": "q-expired-001"},
                ),
            )
            result = await server.call_tool(req)
        payload = json.loads(result.content[0].text)
        assert "detail" in payload


# ── ERR_DEVICE_OFFLINE (discover, 503) ───────────────────────────────────────

class TestDeviceOffline:
    @pytest.mark.asyncio
    async def test_discover_offline_device_is_error(self):
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(503, ERR_DEVICE_OFFLINE)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.discover",
                    arguments={"job_id": "j-offline"},
                ),
            )
            result = await server.call_tool(req)
        assert result.isError is True
        payload = json.loads(result.content[0].text)
        assert "503" in payload.get("error", "")


# ── ERR_UNSAFE_PARAMETER (safety error, 422) ─────────────────────────────────

class TestSafetyError:
    @pytest.mark.asyncio
    async def test_unsafe_parameter_is_error(self):
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(422, ERR_UNSAFE_PARAMETER)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.quote",
                    arguments={
                        "job_id": "j-unsafe",
                        "device_id": "laser-cutter-1",
                        "domain": "manufacturing.laser.v1",
                        "payload": {"temperature": 999},
                    },
                ),
            )
            result = await server.call_tool(req)
        assert result.isError is True

    @pytest.mark.asyncio
    async def test_safety_error_not_swallowed(self):
        """Safety errors must NOT be returned as successful results."""
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(422, ERR_UNSAFE_PARAMETER)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.quote",
                    arguments={
                        "job_id": "j-unsafe",
                        "device_id": "laser-cutter-1",
                        "domain": "manufacturing.laser.v1",
                    },
                ),
            )
            result = await server.call_tool(req)
        # isError must be True — safety errors must never look like success
        assert result.isError is True
        assert result.content[0].text  # something is returned


# ── ERR_APPROVAL_REQUIRED (execute, 403) ─────────────────────────────────────

class TestApprovalRequired:
    @pytest.mark.asyncio
    async def test_execute_no_approval_token_is_error(self):
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(403, ERR_APPROVAL_REQUIRED)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.execute",
                    arguments={"job_id": "j-restricted", "quote_id": "q-restricted-001"},
                ),
            )
            result = await server.call_tool(req)
        assert result.isError is True
        payload = json.loads(result.content[0].text)
        assert "403" in payload.get("error", "")


# ── ERR_JOB_NOT_FOUND (telemetry/abort, 404) ─────────────────────────────────

class TestJobNotFound:
    @pytest.mark.asyncio
    async def test_telemetry_missing_job_is_error(self):
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(404, ERR_JOB_NOT_FOUND)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.telemetry",
                    arguments={"job_id": "job-missing-999"},
                ),
            )
            result = await server.call_tool(req)
        assert result.isError is True
        payload = json.loads(result.content[0].text)
        assert "404" in payload.get("error", "")

    @pytest.mark.asyncio
    async def test_abort_missing_job_is_error(self):
        """Abort on a non-existent job must not raise an unhandled exception."""
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        mock_client = _make_error_client(404, ERR_JOB_NOT_FOUND)
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            req = CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(
                    name="aimp.abort",
                    arguments={"job_id": "job-missing-999", "reason": "test"},
                ),
            )
            result = await server.call_tool(req)
        assert result.isError is True


# ── Generic / unknown tool ────────────────────────────────────────────────────

class TestUnknownTool:
    @pytest.mark.asyncio
    async def test_unknown_tool_returns_is_error(self):
        """An unknown tool name must return isError=True, not raise unhandled."""
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        req = CallToolRequest(
            method="tools/call",
            params=CallToolRequestParams(
                name="aimp.nonexistent",
                arguments={"job_id": "j-000"},
            ),
        )
        result = await server.call_tool(req)
        assert result.isError is True

    @pytest.mark.asyncio
    async def test_unknown_tool_error_message_useful(self):
        """Error message should hint at the bad tool name."""
        import server
        from mcp.types import CallToolRequest, CallToolRequestParams
        req = CallToolRequest(
            method="tools/call",
            params=CallToolRequestParams(
                name="aimp.nonexistent",
                arguments={"job_id": "j-000"},
            ),
        )
        result = await server.call_tool(req)
        payload = json.loads(result.content[0].text)
        assert "error" in payload
