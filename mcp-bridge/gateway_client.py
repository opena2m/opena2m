"""
MCP Bridge — Gateway HTTP Client

Thin async wrapper around httpx.AsyncClient for AIMP gateway calls.
Reads AIMP_GATEWAY_URL and AIMP_GATEWAY_TOKEN from the environment;
these can be overridden at call time via keyword arguments.

Usage::

    from gateway_client import GatewayClient

    client = GatewayClient()
    result = await client.post("/v1/discover", body={...})
    result = await client.get("/v1/jobs/job-001/telemetry")
"""
from __future__ import annotations

import os
import time
import uuid
from typing import Any, Optional

import httpx

GATEWAY_URL   = os.getenv("AIMP_GATEWAY_URL",   "http://localhost:8080")
GATEWAY_TOKEN = os.getenv("AIMP_GATEWAY_TOKEN", "dev-token")
AIMP_VERSION  = "1.0"


def make_envelope(job_id: Optional[str] = None, idempotency_key: Optional[str] = None) -> dict:
    """Build a standard AIMP request envelope."""
    return {
        "aimp_version": AIMP_VERSION,
        "job_id": job_id or f"mcp-{uuid.uuid4().hex[:20].upper()}",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "idempotency_key": idempotency_key,
        "metadata": {"creator": "agent://mcp-bridge"},
    }


class GatewayClient:
    """
    Async AIMP gateway client.

    All requests are authenticated with the bearer token configured via
    AIMP_GATEWAY_TOKEN (or the ``token`` constructor argument).
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = (base_url or GATEWAY_URL).rstrip("/")
        self.token = token or GATEWAY_TOKEN
        self.timeout = timeout

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def get(self, path: str, params: Optional[dict] = None) -> Any:
        """
        HTTP GET ``path`` with optional query ``params``.
        Raises ``httpx.HTTPStatusError`` on 4xx / 5xx responses.
        """
        url = self.base_url + path
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(), params=params)
            resp.raise_for_status()
            return resp.json()

    async def post(self, path: str, body: Optional[dict] = None) -> Any:
        """
        HTTP POST ``path`` with JSON ``body``.
        Raises ``httpx.HTTPStatusError`` on 4xx / 5xx responses.
        """
        url = self.base_url + path
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers=self._headers(), json=body)
            resp.raise_for_status()
            return resp.json()
