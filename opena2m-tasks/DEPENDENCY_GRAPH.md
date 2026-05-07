# OpenA2M — Full Dependency Graph

> **Machine-readable dependency map for AI task orchestration.**
> A task cannot start until all `depends_on` tasks are `status: done`.

---

## Quick Reference Table

| ID | Title | Week | Priority | Status | Depends On | Blocks |
|----|-------|------|----------|--------|------------|--------|
| INFRA-001 | Repo, CI, Docker Compose & Seed | W1–W2 | P1 | **done** | — | GW-001, ADP-001, UI-001 |
| GW-001 | Gateway Core (state machine, DB, auth, AIMP verbs) | W2–W9 | P1 | **done** | INFRA-001 | GW-002, GW-003, UI-001, MCP-001 |
| ADP-001 | Adapter SDK + Print2D Sim | W2–W5 | P1 | **done** | INFRA-001 | GW-002 |
| GW-002 | Gateway HITL, SSE, Webhooks + FDM Sim | W9–W14 | P1 | **done** | GW-001, ADP-001 | GW-003, UI-001 |
| UI-001 | Console Core (Dashboard, Jobs, Review Queue) | W6–W14 | P1 | **done** | GW-001 | UI-002 |
| GW-003 | Policy Engine, Budget Engine, Audit Log | W14–W20 | P1 | **in-progress** | GW-002 | UI-002, MCP-001 |
| UI-002 | Console Advanced (Policy, Budget, Audit, Settings) | W18–W22 | P1 | **done** | GW-003, UI-001 | MCP-001 |
| MCP-001 | MCP Bridge | W21–W24 | P1 | **done** | GW-003 | — |

---

## Dependency Tree (ASCII)

```
W1-W2   INFRA-001: Repo, CI, Docker Compose & Seed
            │
      ┌─────┴────────────────────────────────┐
      │                                      │
W2-W9 GW-001: Gateway Core              W2-W5 ADP-001: Adapter SDK + Print2D Sim
      │  (state machine, DB, AIMP verbs)     │
      │                                      │
      │ ◄────── UI-001 can start W6 ─────────┤
      │         against mock dataLayer       │
      │                                      │
      └────────────┬─────────────────────────┘
                   │  (both required)
W9-W14         GW-002: Gateway HITL, SSE, Webhooks + FDM Sim
                   │
          ┌────────┴────────────────────────┐
          │                                 │
W14-W20  GW-003: Policy, Budget, Audit   UI-001 completes (can overlap W6-W14)
          │                                 │
          └──────────────┬──────────────────┘
                         │  (both required)
W18-W22            UI-002: Console Advanced (Policy, Budget, Audit)
                         │
W21-W24            MCP-001: MCP Bridge
                         │
                       v1.0
```

---

## Parallel Work Opportunities

| Pair | Why they can run simultaneously |
|------|----------------------------------|
| GW-001 + ADP-001 | ADP-001 depends only on INFRA-001; begins W2, before GW-001 completes |
| GW-002 + UI-001 (W6–W9) | UI-001 can start against mock dataLayer as soon as GW-001 core endpoints are stable (W6); switches to real API when GW-002 lands |
| GW-003 + UI-002 (W18–W20) | UI-002 can scaffold pages and wiring while GW-003 finalises API contracts; switches off mock by W20 |
| GW-003 Groups 01–03 + UI-002 Group 01 | Policy engine backend and console page scaffold have no shared code |

---

## Critical Path

The minimum sequence that must not slip:

```
INFRA-001 → GW-001 → GW-002 → GW-003 → UI-002 → v1.0 tag
```

If any task on the critical path slips by 1 week, the v1.0 release date slips by the same.

The riskiest single task is **GW-001** (8 weeks; gates GW-002, UI-001, and MCP-001). De-risk by completing state machine + DB schema (Groups 01–03) by end of W4 so downstream mock wiring can begin.

---

## Hard External Deadlines

| Milestone | Timing | Action Required |
|-----------|--------|----------------|
| Adapter SDK v0 freeze | End W5 | ADP-001 interface_lock must be exported; GW-002 depends on it |
| Gateway REST API v1 freeze | End W9 | GW-001 OpenAPI spec exported; UI-001 and MCP-001 depend on it |
| Console Review Queue UX test | W12 | Early usability test to verify ≤ 30 s HITL resolution metric |
| Journey A/B/C/D green in CI | W23 | Hard gate before v1.0 tag |
| v1.0 tag | End W24 | All tasks done; git-clone-to-running demo recorded |

---

## Interface Lock Dates

| Interface | Lock By | Consumed By |
|-----------|---------|-------------|
| Adapter SDK base class (`aimp_sdk/base.py`) + `AdapterManifest` + `JobContext` API | End W5 | GW-002 (FDM sim), any third-party adapters |
| Gateway REST API OpenAPI spec v1 (`/v1/...`) | End W9 | UI-001 (Console Core), MCP-001 |
| DB schema migration baseline (all tables from tech-design §4.1) | End W4 | All gateway services from GW-002 onward |
| Policy YAML grammar + `POST /v1/policies` shape | End W16 | UI-002 (Policy editor), MCP-001 |
| Approval token JWT shape (ed25519, bound to job_id) | End W10 | UI-001 (Review Queue signs tokens), ADP-001 compliance harness |

---

## Remaining Work (updated 2026-05-08 — post-dev-sprint)

All P1 blockers from the initial audit have been resolved. The implementation is **≥ 98% complete**.

### P1 Items — ALL RESOLVED ✅

| Item | Resolution |
|------|-----------|
| `.github/workflows/ci.yml` | 9-job CI pipeline written (lint, test-gateway, validate-schemas, test-adapter-sdk, test-e2e, test-mcp, test-console-e2e, test-journey-cd) |
| `scripts/validate_schemas.py` | Written; validates OpenAPI spec + adapter schemas + example payloads |
| `gateway/openapi.json` | Exported; 30 paths; interface lock committed |
| `gateway/app/cli/audit_verify.py` | Full ed25519 + hash-chain verifier; supports zip bundle + live gateway |
| `scripts/test_journey_d.py` | Budget runaway E2E with ERR_BUDGET_EXCEEDED assertion |
| `console/src/pages/Login.tsx` | OIDC redirect + API token fallback; OIDC callback handler; wired into App.tsx |
| Playwright E2E tests | 5 spec files: journey_a, review_queue, abort, journey_d, audit_export; helpers.ts |
| `scripts/test_journey_c.py` | Espresso adapter demo; install via entry-point; compute_quote test |
| `mcp-bridge/tests/` | test_tools.py (18 tests) + test_error_passthrough.py (16 tests) |
| `adapter-sdk/aimp_sdk/types.py` | Standalone types module (RiskTier, AdapterManifest, Quote, etc.) |
| `adapter-sdk/aimp_sdk/mock_context.py` | MockJobContext for adapter unit testing |
| `adapter-sdk/aimp_sdk/utils.py` | simulate_progress, simulate_sensors, validate_parameter_bounds |

### P2 Remaining (nice-to-have, not blocking v1.0)

| Gap | Task | Effort |
|-----|------|--------|
| OIDC login implementation — `/v1/auth/login` still returns 501 | GW-003 | 8h |
| `mcp-bridge/gateway_client.py` — HTTP client inline in server.py, not a separate module | MCP-001 | 1h |
| MCP resource `aimp://device/{id}/state` not implemented | MCP-001 | 1.5h |
| axe-core accessibility tests (console) | UI-001, UI-002 | 4h |
| `tests/integration/test_audit_export.py` | GW-003 | 2h |
| MCP bridge Docker Compose integration test | MCP-001 | 2h |
