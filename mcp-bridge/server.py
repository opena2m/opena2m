"""
OpenA2M MCP Bridge — AIMP §03
Exposes the five AIMP core verbs as Model Context Protocol (MCP) tools.
Any MCP-compatible agent can drive physical machines through this bridge.
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import time
import uuid
from typing import Any, Dict, Optional

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    AnyUrl,
    CallToolRequest,
    CallToolResult,
    ListResourcesRequest,
    ListResourcesResult,
    ListToolsRequest,
    ListToolsResult,
    ReadResourceRequest,
    ReadResourceResult,
    Resource,
    TextContent,
    TextResourceContents,
    Tool,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("aimp.mcp_bridge")

GATEWAY_URL = os.getenv("AIMP_GATEWAY_URL", "http://localhost:8080")
GATEWAY_TOKEN = os.getenv("AIMP_GATEWAY_TOKEN", "dev-token")
AIMP_VERSION = "1.0"

server = Server("aimp-mcp-bridge")


def _make_envelope(job_id: Optional[str] = None, idempotency_key: Optional[str] = None) -> dict:
    return {
        "aimp_version": AIMP_VERSION,
        "job_id": job_id or f"mcp-{uuid.uuid4().hex[:20].upper()}",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "idempotency_key": idempotency_key,
        "metadata": {"creator": "agent://mcp-bridge"},
    }


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {GATEWAY_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def _call_gateway(method: str, path: str, body: Optional[dict] = None) -> dict:
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=30.0) as client:
        if method == "GET":
            resp = await client.get(path, headers=_headers())
        elif method == "POST":
            resp = await client.post(path, headers=_headers(), json=body)
        else:
            raise ValueError(f"Unsupported method: {method}")
        resp.raise_for_status()
        return resp.json()


# ─── Tool definitions ─────────────────────────────────────────────────────────

TOOLS = [
    Tool(
        name="aimp.discover",
        description=(
            "Discover available physical machines and their capabilities. "
            "Returns a list of devices with supported domains, consumables, and current state. "
            "Call this first to find which device_id and domain to use."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Client-generated ULID or UUID for this request."},
                "domains": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional domain filter globs, e.g. ['manufacturing.additive.*'].",
                },
                "device_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of specific device IDs to query.",
                },
            },
            "required": ["job_id"],
        },
    ),
    Tool(
        name="aimp.quote",
        description=(
            "Obtain a firm, time-bound price quote for a physical job. "
            "Does NOT start any physical work. Returns quote_id, cost breakdown, "
            "resource consumption, and validity window. "
            "Use the returned quote_id with aimp.execute to start the job."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Client-generated ULID for this job."},
                "device_id": {"type": "string", "description": "Target device from discover results."},
                "domain": {"type": "string", "description": "Domain schema ID, e.g. 'manufacturing.additive.fdm.v1'."},
                "payload": {"type": "object", "description": "Domain-specific parameters (validated against domain schema)."},
                "asset": {
                    "type": "object",
                    "description": "Asset reference: {type, format, url, hash_sha256}.",
                    "properties": {
                        "type": {"type": "string"},
                        "format": {"type": "string"},
                        "url": {"type": "string"},
                        "hash_sha256": {"type": "string"},
                    },
                },
                "budget_limit": {
                    "type": "object",
                    "description": "Maximum acceptable cost: {amount, currency}.",
                    "properties": {
                        "amount": {"type": "number"},
                        "currency": {"type": "string", "default": "USD"},
                    },
                    "required": ["amount"],
                },
                "idempotency_key": {"type": "string"},
            },
            "required": ["job_id", "device_id", "domain"],
        },
    ),
    Tool(
        name="aimp.execute",
        description=(
            "Commit a prior quote and start physical execution. "
            "This is IRREVERSIBLE without calling aimp.abort. "
            "Requires a valid quote_id from aimp.quote. "
            "Returns state=LOCKED immediately; use aimp.telemetry to track progress."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Same job_id used in the quote call."},
                "quote_id": {"type": "string", "description": "quote_id returned by aimp.quote."},
                "approval_token": {
                    "type": "string",
                    "description": "HITL approval token (required for restricted/hazardous devices).",
                },
                "audit_requirements": {
                    "type": "object",
                    "description": "Optional audit config: {snapshot_interval_seconds, sensors, ai_vision_checks, pause_for_human_at}.",
                },
            },
            "required": ["job_id", "quote_id"],
        },
    ),
    Tool(
        name="aimp.telemetry",
        description=(
            "Get the current state, progress, sensor readings, and media for a job. "
            "Poll this after aimp.execute to track job progress. "
            "When state=AUDITING, check human_action_required for HITL instructions."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Job ID to observe."},
                "since": {"type": "string", "description": "RFC3339 timestamp; return only events after this time."},
            },
            "required": ["job_id"],
        },
    ),
    Tool(
        name="aimp.abort",
        description=(
            "Immediately stop a job. Physical emergency stop. "
            "Never rate-limited — safety always wins. "
            "Idempotent: aborting a terminal job succeeds silently."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Job ID to abort."},
                "reason": {"type": "string", "description": "Human-readable reason for the abort."},
                "recovery_mode": {
                    "type": "string",
                    "enum": ["safe_home", "hard_stop", "freeze"],
                    "default": "safe_home",
                    "description": "How the device should recover after abort.",
                },
            },
            "required": ["job_id"],
        },
    ),
    Tool(
        name="aimp.resume",
        description=(
            "Resume a job paused in AUDITING state. "
            "Provide decision=CONTINUE to approve, ABORT to stop, or ADJUST with "
            "parameter_overrides to modify parameters before resuming."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Job ID to resume."},
                "approval_token": {
                    "type": "string",
                    "description": "Token from telemetry human_action_required.approve_url.",
                },
                "decision": {
                    "type": "string",
                    "enum": ["CONTINUE", "ABORT", "ADJUST"],
                    "description": "CONTINUE to approve, ABORT to stop, ADJUST to override parameters.",
                },
                "parameter_overrides": {
                    "type": "object",
                    "description": "Parameter overrides (only valid with ADJUST decision).",
                },
                "reviewer_note": {"type": "string", "description": "Optional reviewer annotation."},
            },
            "required": ["job_id", "approval_token", "decision"],
        },
    ),
]


@server.list_tools()
async def list_tools(request: ListToolsRequest) -> ListToolsResult:
    return ListToolsResult(tools=TOOLS)


# ─── Resources ────────────────────────────────────────────────────────────────

@server.list_resources()
async def list_resources(request: ListResourcesRequest) -> ListResourcesResult:
    """
    List AIMP resources exposed through the MCP bridge.

    Currently exposes every registered device as a resource at
    ``aimp://device/{device_id}/state`` so agents can read device state
    without consuming a tool call.
    """
    try:
        body = {
            "envelope": _make_envelope(),
            "device_filter": {},
        }
        result = await _call_gateway("POST", "/v1/discover", body)
        devices = result.get("devices", [])
    except Exception:
        devices = []

    resources = [
        Resource(
            uri=AnyUrl(f"aimp://device/{d['device_id']}/state"),
            name=f"Device: {d.get('display_name', d['device_id'])}",
            description=(
                f"Current state of device {d['device_id']} "
                f"(domain: {d.get('domain', 'unknown')}, state: {d.get('state', 'UNKNOWN')})"
            ),
            mimeType="application/json",
        )
        for d in devices
    ]

    # Always include a static gateway-info resource
    resources.insert(
        0,
        Resource(
            uri=AnyUrl("aimp://gateway/info"),
            name="Gateway Info",
            description="AIMP gateway capabilities and registered domains.",
            mimeType="application/json",
        ),
    )

    return ListResourcesResult(resources=resources)


@server.read_resource()
async def read_resource(request: ReadResourceRequest) -> ReadResourceResult:
    """
    Read an AIMP resource by URI.

    Supported URIs:
      aimp://gateway/info              → GET /capabilities
      aimp://device/{device_id}/state  → GET /v1/devices/{device_id}
    """
    uri = str(request.params.uri)

    try:
        if uri == "aimp://gateway/info":
            data = await _call_gateway("GET", "/capabilities")
        elif uri.startswith("aimp://device/") and uri.endswith("/state"):
            # aimp://device/{device_id}/state
            parts = uri.split("/")
            # parts: ['aimp:', '', 'device', '{device_id}', 'state']
            if len(parts) >= 5:
                device_id = parts[3]
                data = await _call_gateway("GET", f"/v1/devices/{device_id}")
            else:
                raise ValueError(f"Malformed device URI: {uri}")
        else:
            raise ValueError(f"Unknown resource URI: {uri}")

        return ReadResourceResult(
            contents=[
                TextResourceContents(
                    uri=request.params.uri,
                    mimeType="application/json",
                    text=json.dumps(data, indent=2, default=str),
                )
            ]
        )

    except httpx.HTTPStatusError as exc:
        raise ValueError(f"Gateway HTTP {exc.response.status_code}: {exc.response.text}")
    except Exception as exc:
        raise ValueError(f"Resource read failed: {exc}")


@server.call_tool()
async def call_tool(request: CallToolRequest) -> CallToolResult:
    name = request.params.name
    args: Dict[str, Any] = request.params.arguments or {}

    try:
        result = await _dispatch(name, args)
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps(result, indent=2, default=str))],
            isError=False,
        )
    except httpx.HTTPStatusError as exc:
        err = {"error": f"Gateway HTTP {exc.response.status_code}", "detail": exc.response.text}
        logger.error("Gateway error for tool %s: %s", name, err)
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps(err))],
            isError=True,
        )
    except Exception as exc:
        logger.exception("Tool %s failed: %s", name, exc)
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps({"error": str(exc)}))],
            isError=True,
        )


async def _dispatch(name: str, args: dict) -> dict:
    job_id = args.get("job_id", f"mcp-{uuid.uuid4().hex[:20].upper()}")

    if name == "aimp.discover":
        body = {
            "envelope": _make_envelope(job_id),
            "device_filter": {
                "domains": args.get("domains"),
                "device_ids": args.get("device_ids"),
            },
        }
        return await _call_gateway("POST", "/v1/discover", body)

    elif name == "aimp.quote":
        body = {
            "envelope": _make_envelope(job_id, args.get("idempotency_key")),
            "device_id": args["device_id"],
            "domain": args["domain"],
            "payload": args.get("payload", {}),
            "asset": args.get("asset"),
            "budget_limit": args.get("budget_limit"),
        }
        return await _call_gateway("POST", "/v1/quote", body)

    elif name == "aimp.execute":
        body = {
            "envelope": _make_envelope(job_id),
            "quote_id": args["quote_id"],
            "approval_token": args.get("approval_token"),
            "audit_requirements": args.get("audit_requirements"),
        }
        return await _call_gateway("POST", "/v1/execute", body)

    elif name == "aimp.telemetry":
        path = f"/v1/jobs/{job_id}/telemetry"
        if args.get("since"):
            path += f"?since={args['since']}"
        return await _call_gateway("GET", path)

    elif name == "aimp.abort":
        body = {
            "envelope": _make_envelope(job_id),
            "reason": args.get("reason", "mcp_abort"),
            "recovery_mode": args.get("recovery_mode", "safe_home"),
        }
        return await _call_gateway("POST", f"/v1/jobs/{job_id}/abort", body)

    elif name == "aimp.resume":
        body = {
            "envelope": _make_envelope(job_id),
            "approval_token": args["approval_token"],
            "decision": args["decision"],
            "parameter_overrides": args.get("parameter_overrides"),
            "reviewer_note": args.get("reviewer_note"),
        }
        return await _call_gateway("POST", f"/v1/jobs/{job_id}/resume", body)

    else:
        raise ValueError(f"Unknown tool: {name}")


async def main():
    logger.info("AIMP MCP Bridge starting (gateway: %s)", GATEWAY_URL)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
