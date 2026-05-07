# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**OpenA2M** is a reference implementation of the **AIMP (AI-to-Machine Protocol)** — a spec defining the contract between AI agents and physical machines. It includes:
- A **FastAPI gateway** (`gateway/`) implementing the AIMP REST API
- A **React/TypeScript operator console** (`console/`) for human oversight
- An **adapter SDK** (`adapter-sdk/`) for third-party domain implementations
- An **MCP bridge** (`mcp-bridge/`) wrapping AIMP REST for AI agent use

---

## Commands

All developer workflows go through `make` at the repo root.

### Full Stack (Docker)
```bash
make dev-up          # Start postgres, redis, minio, gateway, console
make dev-down        # Stop containers
make seed            # Register reference devices and policies (run after dev-up)
make dev-logs        # Follow all service logs
```

### Local Dev (without Docker)
```bash
make gateway-install && make gateway-dev   # Gateway on :8080 (hot-reload)
make console-install && make console-dev   # Console on :3000
```

### Testing
```bash
make test              # All tests
make test-gateway      # pytest in gateway/ (asyncio_mode=auto)
make test-e2e          # Journey A (2D print) + Journey B (FDM + HITL)
```
Run a single gateway test:
```bash
cd gateway && python -m pytest tests/path/to/test_file.py::test_name -v
```

### Linting
```bash
make lint              # All
make lint-gateway      # ruff + mypy on gateway/app/
make lint-console      # eslint on console/
```

### Console (npm, from `console/`)
```bash
npm run dev      # Dev server
npm run build    # Production build
npm run lint     # ESLint
```

---

## Architecture

### Services & Ports

| Service   | Port | Stack |
|-----------|------|-------|
| Gateway   | 8080 | FastAPI, SQLAlchemy, Pydantic, AsyncPG |
| Console   | 3000 | React 18, Vite, TypeScript, Tailwind, TanStack Query |
| MCP Bridge| 8090 | Python MCP server |
| PostgreSQL | 5432 | Primary DB (default: SQLite in dev) |
| Redis     | 6379 | Pub/sub for telemetry fan-out |
| MinIO     | 9000 | Object store for media/sensor data |

Vite proxies `/v1`, `/health`, `/capabilities` → `localhost:8080`.

### Job Lifecycle

Jobs move through a state machine: `LOCKED → EXECUTING → AUDITING → FULFILLING → COMPLETED` (plus `FAILED`, `ABORTED`). The `AUDITING` state is a deliberate pause for human-in-the-loop (HITL) checkpoints before `resume` is called.

### Gateway Layout (`gateway/app/`)

- `routers/` — REST endpoints (`discover`, `quote`, `execute`, `telemetry`, `abort`, `resume`, `jobs`, `devices`, `domains`, `policies`, `budgets`, `webhooks`, `audit`, `metrics`)
- `services/` — Business logic (`job_service`, `policy_engine`, `budget_service`, `webhook_dispatcher`, `adapter_registry`)
- `core/` — Cross-cutting concerns (`config`, `database`, `auth`, `redis_client`, `state_machine`, `audit`, `tracing`)
- `adapters/` — Built-in adapter plugins (`print2d-sim`, `fdm-sim`)

### Console Layout (`console/src/`)

- `pages/` — One file per route (Dashboard, Jobs, JobDetail, Devices, Review, AuditLog, Settings, etc.)
- `lib/api.ts` — Axios client; `lib/dataLayer.ts` — switches between real API and mock data
- `store/` — Zustand global state
- `i18n/` — Translations

### Adapter Plugin System

Adapters are loaded via Python entry-points. Each implements `BaseAdapter` from `adapter-sdk/aimp_sdk/base.py` and must define `domain_id`, `compute_quote()`, and `execute()`. The gateway's `adapter_registry` loads them at startup.

### Config

All gateway config is 12-factor env vars via Pydantic Settings in `gateway/app/core/config.py`. Key vars:
- `AIMP_DB_URL` (defaults to SQLite)
- `AIMP_REDIS_URL`
- `AIMP_JWT_SECRET`, `AIMP_DEV_TOKEN`
- `AIMP_OBJECT_STORE_*` (MinIO/S3)

### Reference Scenarios

- **Journey A** (`scripts/test_journey_a.py`) — Happy-path 2D cloud print: discover → quote → execute → completed
- **Journey B** (`scripts/test_journey_b.py`) — FDM with HITL: execute → 50% AUDITING pause → vision check → resume → completed
- **Journey C** (`scripts/test_journey_c.py`) — Developer adds a new adapter without touching gateway core
- **Journey D** (`scripts/test_journey_d.py`) — Runaway budget: agent hits ceiling; 5th job rejected at quote time with `ERR_BUDGET_EXCEEDED`

### Critical Code Paths

These files are the safety core of AIMP — any change requires all existing tests to pass and the audit chain to be verified end-to-end:

- `gateway/app/core/state_machine.py` — nine-state FSM; all transitions must match tech-design §6.2 exactly; **never update `jobs.state` outside `apply_transition()`**
- `gateway/app/core/audit.py` — ed25519 hash-chain; every `apply_transition()` writes jobs + job_state_transitions + audit_log in one transaction
- `gateway/app/services/job_service.py` — quote→execute→telemetry→abort orchestration
- `gateway/app/services/budget_service.py` — `SELECT FOR UPDATE` on budget row during reserve; concurrent reserves must not exceed ceiling
- `console/src/lib/dataLayer.ts` — sole data-access point for all Console pages; never import `api.ts` directly from a page

### Adapter Base Class Contract

The `AIMPAdapter` base class in `adapter-sdk/aimp_sdk/base.py` is a **frozen interface** (locked at end W5). Adapters implement:

```python
async def register() -> AdapterManifest
async def quote(ctx: QuoteContext) -> Quote
async def start(ctx: JobContext) -> None    # calls ctx.emit_*, ctx.request_human_pause(), ctx.finalize()
async def abort(ctx: JobContext) -> None
# Optional: poll(), finalize(), resume()
```

Adapters must never import from `gateway.app` — only from `aimp_sdk`. A minimal adapter must fit in ≤ 300 LOC.

### Key Safety Rules for Code Changes

1. `abort` is abort-primacy: accepted from any non-terminal state, never rate-limited, no approval token required
2. Approval tokens are single-use — mark `used_at` in the same transaction as the resume state transition
3. `resume(ADJUST)` may only override `parameters` sub-fields; never `asset`, `logistics`, or risk-tier fields
4. Safety error codes (`ERR_UNSAFE_PARAMETER`, `ERR_VISION_AUDIT_FAILED`, `ERR_INTERLOCK_OPEN`) must always carry `retryable: false`
5. Media URLs returned by telemetry are pre-signed with ≤ 1 h TTL; store the object-store key, not the URL

---

## Task Breakdown (`opena2m-tasks/`)

A full AI-executable task breakdown lives in `opena2m-tasks/`. Read `opena2m-tasks/AGENT.md` before picking up any implementation work.

### Build Milestones

| ID | Component | Weeks | Hours | Unlocks |
|----|-----------|-------|-------|---------|
| INFRA-001 | Repo, CI, Docker Compose & Seed | W1–W2 | 24 | everything |
| GW-001 | Gateway Core (state machine, DB, auth, AIMP verbs) | W2–W9 | 200 | GW-002, UI-001, MCP-001 |
| ADP-001 | Adapter SDK + Print2D + FDM sims | W2–W5 | 60 | GW-002 |
| GW-002 | Gateway HITL, SSE, Webhooks + FDM integration | W9–W14 | 100 | GW-003, UI-001 full |
| GW-003 | Policy engine, Budget engine, Audit log, OIDC | W14–W20 | 120 | UI-002, MCP-001 |
| UI-001 | Console Core (Dashboard, Jobs, Review Queue) | W6–W14 | 100 | UI-002 |
| UI-002 | Console Advanced (Policy, Budget, Audit, Settings) | W18–W22 | 80 | MCP-001 |
| MCP-001 | MCP Bridge | W21–W24 | 40 | — |

**Critical path:** `INFRA-001 → GW-001 → GW-002 → GW-003 → UI-002 → v1.0`

**Parallel opportunities:** ADP-001 runs alongside GW-001 from W2; UI-001 can start W6 against mock dataLayer while GW-002 is in progress.

---

## AIMP Protocol Spec (`docs/aimp/en/`)

The full protocol spec lives in `docs/aimp/en/`. Key concepts every contributor needs to understand:

### Core Verbs (§01)

AIMP defines exactly **five** domain-agnostic verbs. All other endpoints are management convenience:

| Verb | Endpoint | Purpose |
|------|----------|---------|
| `discover` | `POST /v1/discover` | Capability handshake — lists devices and their domains |
| `quote` | `POST /v1/quote` | Price a proposed job; MUST NOT start physical work |
| `execute` | `POST /v1/execute` | Commit a quote and begin execution (`202 Accepted`) |
| `telemetry` | `GET /v1/jobs/{id}/telemetry` | Poll state, progress, sensor readings, media URLs |
| `abort` | `POST /v1/jobs/{id}/abort` | Emergency stop — never rate-limited, always highest priority |

The full state machine from spec §01.4 (superset of what the code exposes):

```
PENDING → QUOTED → LOCKED → EXECUTING ⇄ AUDITING → FULFILLING → COMPLETED
                                                  ↘ ABORTED / FAILED
```

`AUDITING` is a first-class protocol state, not an afterthought. While `AUDITING`, the physical machine holds in a safe pattern; no new irreversible motion occurs. Resume via `POST /v1/jobs/{id}/resume` with `decision: "CONTINUE" | "ABORT" | "ADJUST"`.

### Domain Namespace Convention (§02)

Domains follow reverse-dotted, versioned namespaces:

```
manufacturing.additive.fdm.v1      # FDM 3D printing
manufacturing.print.2d.v1          # 2D inkjet/laser print
kinematics.robotic_arm.v1          # 6-DOF arms
fluidics.pipette.v2                # Lab liquid handling
thermodynamics.cooking.v1          # Smart kitchen appliances
```

JSON Schemas for all built-in domains are in `docs/aimp/schemas/domains/`. When implementing a new adapter, the `payload` field in `quote`/`execute` is validated against the domain's schema.

### Risk Tiers (§04)

Every domain declares a risk tier that drives HITL policy:

| Tier | Examples | Default policy |
|------|----------|----------------|
| `routine` | 2D printing, label making | Agent-only; budget ceiling enforced |
| `restricted` | FDM printing, CNC, food prep | Human confirmation required above 50 USD OR on unaudited assets |
| `hazardous` | High-power lasers, chemical reactors, motion near humans | Human confirmation on **every** execute |

The gateway enforces tiers; adapters declare them in their domain schema. Gateways may override *upward* (more cautious) but never downward.

### Request Envelope (§01)

Every request body wraps a common envelope:

```json
{
  "aimp_version": "1.0",
  "job_id": "<client-generated ULID or UUIDv7>",
  "timestamp": "<RFC 3339 UTC>",
  "idempotency_key": "<optional but recommended>"
}
```

`job_id` is client-generated. The gateway stores it and rejects duplicates within the retention window (24 h recommended). `idempotency_key` makes `quote` and `execute` safe to retry.

### MCP / A2A Integration (§03)

The MCP bridge exposes the five verbs as MCP tools: `aimp.discover`, `aimp.quote`, `aimp.execute`, `aimp.telemetry`, `aimp.abort`. In a multi-agent system only the **Executor Agent** should call AIMP directly; other agents (Design, Review, Finance, Audit) coordinate via A2A and pass signed `approval_token`s.

### Error Codes (§06)

All errors use the standard envelope `{"error": {"code": "ERR_...", "category": "...", "retryable": bool, ...}}`. Categories: `validation`, `auth`, `policy`, `resource`, `hardware`, `asset`, `network`, `safety`, `vendor`, `internal`. Safety errors (`ERR_UNSAFE_PARAMETER`, `ERR_VISION_AUDIT_FAILED`, etc.) must **never** be auto-retried — require explicit human intervention.

### Audit & Telemetry (§05)

Telemetry streams four data kinds: `state`, `progress` (`[0.0, 1.0]`), `sensor` (named float series with SI units), and `media` (pre-signed URLs, ≤1 h TTL). Sensor channels use reverse-dotted identifiers (`extruder_temp`, `chamber.temp`, `arm.joint.3.torque`). AI vision checks are declared by name in `audit_requirements.ai_vision_checks` at execute time; results carry `verdict: "pass" | "warn" | "failure" | "inconclusive"` and `recommended_action`.

### Spec Document Map

| File | Contents |
|------|----------|
| `docs/aimp/en/00-overview.md` | Architecture, design principles, conformance levels (L1/L2/L3) |
| `docs/aimp/en/01-core-protocol.md` | Five verbs, state machine, envelope, webhook shape |
| `docs/aimp/en/02-domain-extensions.md` | Namespace convention, JSON Schema authoring, domain registry |
| `docs/aimp/en/03-ai-protocol-integration.md` | MCP tool surface, A2A topology, worked poster example |
| `docs/aimp/en/04-security-and-cost.md` | Risk tiers, budget lifecycle, HITL, asset integrity, abort primacy |
| `docs/aimp/en/05-audit-and-telemetry.md` | Sensor channels, media capture, AI vision checks, AUDITING detail |
| `docs/aimp/en/06-error-codes.md` | Full error code catalogue with HTTP status and retry guidance |
| `docs/aimp/en/07-scenarios.md` | Four end-to-end flows (poster print, FDM gear, lab pipette, sous-vide) |
| `docs/aimp/schemas/core/` | JSON Schemas for core request/response shapes |
| `docs/aimp/schemas/domains/` | JSON Schemas for each built-in domain |
| `docs/aimp/examples/` | Full request/response JSON for the reference scenarios |
