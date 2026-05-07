---
id: MCP-001
title: MCP Bridge — AIMP verbs as MCP tools
component: MCP Bridge
week: W21-W24
status: pending
priority: P1
hours: 40
depends_on: [GW-003]
blocks: []
---

# MCP-001: MCP Bridge — AIMP verbs as MCP tools

## Context
The MCP Bridge exposes the five AIMP verbs as MCP tools so any MCP-compatible agent (including Claude) can call `aimp_discover`, `aimp_quote`, `aimp_execute`, `aimp_telemetry`, `aimp_abort` without knowing AIMP's HTTP shape. It runs as a separate container on port 8090. Per tech-design §3.3 and PRD FR-MCP, it impersonates the agent principal (agents authenticate to the bridge with the same tokens as REST, bridge proxies them). This task also completes Journey C (developer adds an espresso adapter) which exercises the SDK.

**Decide on Day 1:** The bridge uses the Anthropic `mcp` Python SDK. Tool schemas are generated from the Gateway's `/v1/tools.json` (which re-exports the OpenAPI spec in MCP tool format). The bridge never holds state — it is a pure HTTP proxy with MCP framing.

## Prerequisites
- [ ] GW-003 done: full gateway API stable; policy + budget + OIDC working
- [ ] `gateway/openapi.json` committed (GW-001 interface lock)

## Tasks

### Group 01 — MCP Server Scaffold (8h)
- [ ] **[P1]** `mcp-bridge/server.py`: Python `mcp` SDK server; `@mcp.tool()` decorators for `aimp_discover`, `aimp_quote`, `aimp_execute`, `aimp_telemetry`, `aimp_abort`; each tool's `inputSchema` generated from gateway's `openapi.json` tool shapes (4h)
- [ ] **[P1]** `mcp-bridge/requirements.txt`: `mcp`, `httpx`, `pydantic` (0.5h)
- [ ] **[P1]** Gateway REST client: `mcp-bridge/gateway_client.py` using `httpx.AsyncClient`; reads `AIMP_GATEWAY_URL` and proxies the caller's `Authorization: Bearer {token}` header (2h)
- [ ] **[P2]** MCP resources: expose `aimp://device/{device_id}/state` as a resource (read-only, returns current device status JSON) (1.5h)

### Group 02 — Tool Implementations (12h)
- [ ] **[P1]** `aimp_discover`: proxy to `POST /v1/discover`; return device list formatted for MCP tool response (2h)
- [ ] **[P1]** `aimp_quote`: proxy to `POST /v1/quote`; return quote_id + estimated_cost + valid_until (2h)
- [ ] **[P1]** `aimp_execute`: proxy to `POST /v1/execute`; return job_id + state + stream_url (2h)
- [ ] **[P1]** `aimp_telemetry`: proxy to `GET /v1/jobs/{job_id}/telemetry`; return state + progress + latest sensor readings + media URLs (3h)
- [ ] **[P1]** `aimp_abort`: proxy to `POST /v1/jobs/{job_id}/abort`; return final state + partial cost (1h)
- [ ] **[P2]** Error passthrough: map AIMP `ERR_*` error envelope to MCP tool error format verbatim; never swallow errors (2h)

### Group 03 — Journey C (Espresso Adapter Demo) (8h)
- [ ] **[P2]** `scripts/test_journey_c.py`: developer Journey C — scaffold a `beverage.espresso.v1` adapter using `aimp-adapter-sdk init my-espresso` (or manual equivalent); supply a domain JSON Schema; register via entry point; run the gateway, discover the new domain (4h)
- [ ] **[P2]** Verify Journey C exit criteria: gateway loads adapter without core-code changes; schema served from `/v1/schemas/{domain}`; a simulated quote request succeeds immediately (4h)

### Group 04 — Docker + CI (4h)
- [ ] **[P1]** `mcp-bridge/Dockerfile`: python:3.12-slim, install requirements, run `python server.py` on port 8090 (1h)
- [ ] **[P1]** Add `mcp-bridge` service to `docker-compose.yml` (already stubbed from INFRA-001; complete the config) (0.5h)
- [ ] **[P1]** Add `make mcp-test` target that runs `scripts/test_journey_c.py` via the MCP bridge tools (1h)
- [ ] **[P2]** `.github/workflows/ci.yml`: add `test-mcp` job (1.5h)

### Group 05 — Tests (8h)
- [ ] **[P1]** `mcp-bridge/tests/test_tools.py`: mock the gateway HTTP client; verify each tool correctly proxies the request and returns the expected MCP response shape (4h)
- [ ] **[P1]** `mcp-bridge/tests/test_error_passthrough.py`: gateway returns `ERR_BUDGET_EXCEEDED`; verify MCP tool returns the same structured error (2h)
- [ ] **[P2]** Integration test: start MCP bridge against real gateway via Docker Compose; call `aimp_discover` and `aimp_quote` via MCP JSON-RPC (2h)

## AI Execution Prompt

```
You are a Python engineer building the OpenA2M MCP Bridge — a standalone service that exposes AIMP verbs as MCP tools so AI agents (including Claude) can drive physical machines without knowing AIMP's HTTP shape.

TASK: Implement five MCP tools (aimp_discover, aimp_quote, aimp_execute, aimp_telemetry, aimp_abort), each proxying the corresponding Gateway REST endpoint while passing through the caller's bearer token. Run Journey C to verify a third-party adapter can be added without modifying the bridge or gateway.

STACK: Python 3.12 + Anthropic `mcp` Python SDK + httpx async + pydantic; Docker container on port 8090

CRITICAL RULES:
- Bridge is stateless — no DB, no Redis; pure HTTP proxy with MCP framing
- Caller's Authorization header is proxied verbatim to the gateway — bridge never mints tokens
- AIMP error envelopes (ERR_*) must pass through to MCP callers unchanged; never swallow errors
- Tool schemas are derived from gateway/openapi.json — keep them in sync; do not hand-write schemas
- Journey C exit criteria: new adapter loads without touching bridge or gateway core code

Complete Groups 01–05 in order. Run `python -m pytest` after each group. Report before proceeding.
```

## Expected Outputs
- `mcp-bridge/server.py` (complete)
- `mcp-bridge/gateway_client.py`
- `mcp-bridge/requirements.txt`
- `mcp-bridge/Dockerfile`
- `mcp-bridge/tests/test_tools.py`
- `scripts/test_journey_c.py`

## Verification Checklist
- [ ] MCP bridge starts and lists 5 tools on `tools/list`
- [ ] `aimp_discover` returns device list against real gateway in Docker Compose
- [ ] `aimp_abort` is always accepted regardless of gateway rate limits (abort primacy)
- [ ] `ERR_BUDGET_EXCEEDED` passes through to MCP caller as structured error
- [ ] Journey C: espresso adapter discovered by gateway without core code changes
- [ ] `make test-e2e` includes MCP bridge smoke test and passes
