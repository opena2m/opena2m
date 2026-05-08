# OpenA2M — AI Agent Framework

> **This file is the entry point for any AI agent working on this project.**
> Read this entire file before touching any task file.

---

## 1. What Is This Project?

**OpenA2M** is the open reference implementation of the AIMP (AI-to-Machine Protocol) specification — a turnkey control plane that lets AI agents drive physical machines through five standardised verbs while humans supervise via a web console.

It ships four components: a **Gateway** (Python/FastAPI) that owns the AIMP REST surface, job state machine, policy engine, budget enforcement, signed audit log, and telemetry fan-out; an **Operator Console** (React/TypeScript SPA) for live job supervision, HITL review, policy editing, and audit browsing; an **Adapter SDK** (Python package) plus two reference adapters (2D print sim, FDM sim with HITL) that exercise the full L3 conformance level; and an **MCP Bridge** (Python) so any MCP-compatible agent can call AIMP without touching HTTP.

The full stack is a **24-week, ~760 hour** build across 8 task components mapped to 4 PRD milestones.

---

## 2. How to Use These Files

### File Structure
```
opena2m-tasks/
├── AGENT.md                              ← YOU ARE HERE — read first
├── DEPENDENCY_GRAPH.md                   ← Full dependency map (read before picking tasks)
├── CONVENTIONS.md                        ← Code style, naming, repo layout
└── tasks/
    ├── 01-infra-foundation/
    │   └── 01-repo-ci-docker.md          ← INFRA-001
    ├── 02-gateway-core/
    │   └── 01-gateway-core.md            ← GW-001
    ├── 03-adapter-sdk/
    │   └── 01-adapter-sdk-and-sims.md    ← ADP-001
    ├── 04-gateway-hitl-telemetry/
    │   └── 01-hitl-telemetry.md          ← GW-002
    ├── 05-policy-budget-audit/
    │   └── 01-policy-budget-audit.md     ← GW-003
    ├── 06-console-core/
    │   └── 01-console-core.md            ← UI-001
    ├── 07-console-advanced/
    │   └── 01-console-advanced.md        ← UI-002
    └── 08-mcp-bridge/
        └── 01-mcp-bridge.md              ← MCP-001
```

### Task File Anatomy

Every task file has these sections:
- **YAML frontmatter**: id, status, depends_on, blocks, week, hours, priority
- **Context**: Why this task exists, key decisions, downstream contracts
- **Prerequisites**: What must exist before starting
- **Tasks**: Grouped checklists with priority badges and hour estimates
- **AI Execution Prompt**: Self-contained prompt to execute the task
- **Expected Outputs**: Files and artefacts to produce
- **Verification**: How to confirm completion

---

## 3. AI Agent Operating Rules

When acting as an agent on this project, follow these rules **without exception**:

### Rule 1 — Always Check Dependencies First
Before starting any task, verify all `depends_on` tasks in DEPENDENCY_GRAPH.md are
`status: done`. If any dependency is not done, **do not start** — report which dependency
is blocking and ask the human which task to work on next.

### Rule 2 — One Task Group at a Time
Complete one group fully before moving to the next. After each group, update the task
file's checkboxes and `status` field, then report before continuing.

### Rule 3 — Update Status in Real Time
After completing a task item, mark its checkbox:
```markdown
- [x] **[P1]** Task that is done
- [ ] **[P1]** Task still pending
```
Update frontmatter `status`: pending → in-progress → done.

### Rule 4 — Always Write Tests
No task is `done` without tests passing. Every Tasks section ends with a Testing group.
Do not mark a task done until tests pass and coverage target is met.

### Rule 5 — Lock Interfaces Before Downstream Work
When a task has `interface_lock` set, export the public interface (Adapter base class API, REST OpenAPI spec, TypeScript types) to the stated path and commit it before any blocked task starts.

### Rule 6 — Never Invent Specifications
If a task requires a decision not covered in the task file, **stop and ask**.
Do not invent: AIMP protocol wire shapes, approval token formats, ed25519 key schemas, domain JSON Schema structure, policy YAML grammar, DB migration changes, or any numeric constant from docs/03-tech-design.md.

### Rule 7 — Safety-First on State Machine and Audit
The state machine and audit log are the safety core of AIMP. Any PR touching `gateway/app/core/state_machine.py`, `gateway/app/core/audit.py`, or `gateway/app/services/job_service.py` requires: (a) all existing tests still pass, (b) the relevant state transition table in docs/03-tech-design.md §6.2 is satisfied exactly, (c) audit signatures are verified end-to-end in the test suite before merging.

---

## 4. Standard Prompt Templates

### Template A — Gateway / Python Backend Task

```
You are a Python/FastAPI engineer working on the OpenA2M gateway.

TASK: [PASTE TASK TITLE AND CONTEXT SECTION FROM TASK FILE]

STACK:
- Python 3.12 + FastAPI 0.111 + Uvicorn (ASGI)
- SQLAlchemy 2.0 async + Alembic migrations + asyncpg (Postgres) / aiosqlite (dev)
- Pydantic v2 for all request/response models and settings
- Redis 7 via redis-py async for pub/sub
- cryptography library (ed25519) for audit signatures and approval tokens
- pytest + pytest-asyncio (asyncio_mode=auto) + pytest-cov; target ≥ 90% line coverage

CRITICAL RULES:
- All state transitions go through state_machine.py — never update jobs.state directly
- Every state transition must write audit_log in the SAME transaction (§6.3 of tech design)
- jobs.version optimistic lock must be respected on all mutating operations
- Custom AIMP error codes (ERR_*) must map to the catalogue in docs/aimp/en/06-error-codes.md
- Safety errors (ERR_UNSAFE_PARAMETER, ERR_VISION_AUDIT_FAILED) must return retryable: false

Complete Groups 01–N in order. After each group:
1. Run `cd gateway && python -m pytest tests/ -x` — must pass
2. Run `make lint-gateway` — ruff + mypy must be clean
3. Check off completed items and report before proceeding
```

### Template B — Adapter SDK / Adapter Task

```
You are a Python engineer implementing an AIMP adapter for OpenA2M.

TASK: [PASTE TASK TITLE AND CONTEXT SECTION FROM TASK FILE]

STACK:
- Python 3.12; adapter-sdk/aimp_sdk/base.py as the base class
- Adapter lifecycle: register() → quote() → start() → poll() → abort() → finalize() / resume()
- All state/sensor/media emissions via ctx.emit_*() — no direct DB access
- Domain JSON Schema must validate against draft 2020-12 using jsonschema library
- pytest + adapter compliance harness in adapter-sdk/tests/

CRITICAL RULES:
- Adapters MUST NOT import from gateway.app — only from aimp_sdk
- ctx.emit_state() is the only way to request state transitions
- Vision checks declared sandbox=True are subprocessed — no outbound network in the check
- A minimal adapter must fit in ≤ 300 LOC (PRD G3)
- Risk tier declared in AdapterManifest is a floor — gateway may raise it, never lower

Complete Groups in order. Run pytest after each group. Report before proceeding.
```

### Template C — React/TypeScript Console Task

```
You are a React/TypeScript engineer working on the OpenA2M Operator Console.

TASK: [PASTE TASK TITLE AND CONTEXT SECTION FROM TASK FILE]

STACK:
- React 18.3 + TypeScript 5.4 strict mode + Vite 5
- React Router DOM 6 (SPA routing)
- TanStack Query 5 for all server state; Zustand for UI/session state
- Tailwind CSS 3 + shadcn/ui primitives + Lucide icons + Recharts for sensor charts
- Axios via lib/api.ts; lib/dataLayer.ts switches between real API and mock data
- Playwright for E2E key flows; Vitest + React Testing Library for unit

CRITICAL RULES:
- All components fully typed — no any; all API response shapes typed against Gateway OpenAPI
- Skeleton loading states required on all async data (TanStack Query isLoading)
- lib/dataLayer.ts must be the ONLY place that calls lib/api.ts — never import axios elsewhere
- Review Queue page must resolve in ≤ 30 s without scrolling (PRD §8 success metric)
- Confirm step required for all destructive actions: abort, force-fail, policy delete (FR-UI-08)

Complete Groups in order. After each group:
1. `cd console && npm run build` — no type errors
2. `npm run lint` — no ESLint errors
3. Check off items and report before proceeding
```

### Template D — Infrastructure / DevOps Task

```
You are a DevOps engineer setting up infrastructure for OpenA2M.

TASK: [PASTE TASK TITLE AND CONTEXT SECTION FROM TASK FILE]

STACK:
- Docker + Docker Compose v2 for local dev
- Kubernetes + Helm for production
- GitHub Actions for CI/CD
- Postgres 16-alpine, Redis 7-alpine, MinIO for local services
- Prometheus + Grafana for metrics (Makefile targets)

CRITICAL RULES:
- No secrets in code — all via environment variables or mounted secrets volumes
- make dev-up must bring the full stack (gateway, console, postgres, redis, minio) from zero in < 5 min
- make seed must be idempotent — safe to run on an existing database
- All Makefile targets must work from the repo root on macOS and Linux
- git clone → make dev-up → make seed → full Journey A working = the success bar

Complete each group. Validate docker compose config before running. Report before proceeding.
```

---

## 5. Execution Order

Follow this order strictly — later items depend on earlier ones:

```
Phase 1 — Foundation (W1–W4):
  [1] INFRA-001: Repo, CI, Docker Compose           ← Start here
  [2] GW-001:   Gateway Core (state machine, DB, auth, AIMP verbs) ← CRITICAL PATH
  [3] ADP-001:  Adapter SDK + Print2D sim            ← After INFRA-001; parallel start W2

Phase 2 — HITL + FDM + Console Core (W5–W14):
  [4] GW-002:  Gateway HITL + Telemetry (resume, SSE, webhooks, FDM-sim)  ← After GW-001, ADP-001
  [5] UI-001:  Console Core (Dashboard, Jobs, Review Queue) ← After GW-001; parallel with GW-002
  Note: GW-002 and UI-001 can overlap if UI-001 uses mock dataLayer initially

Phase 3 — Policy + Budget + Audit + Console Advanced (W15–W20):
  [6] GW-003:  Policy engine + Budget engine + Audit log  ← After GW-002
  [7] UI-002:  Console Advanced (Policy, Budget, Audit, Devices, Settings) ← After GW-003

Phase 4 — MCP + Polish (W21–W24):
  [8] MCP-001: MCP Bridge                           ← After GW-003
  Hard gate: all four Journey A/B/C/D tests green before v1.0 tag
```

---

## 6. How to Ask AI to Start Working

### Option A — Start a specific task
```
Read opena2m-tasks/AGENT.md and opena2m-tasks/DEPENDENCY_GRAPH.md.
Open opena2m-tasks/tasks/{path/to/task.md} and execute all tasks in it.
Follow the AI Execution Prompt in that file exactly.
Update checkboxes and status as you go.
```

### Option B — Continue where left off
```
Read opena2m-tasks/AGENT.md.
Scan all task files for status: in-progress or the most recently completed done task.
Identify the next unblocked task (all depends_on are done).
Open that task file and execute it.
```

### Option C — Find next task automatically
```
Read opena2m-tasks/DEPENDENCY_GRAPH.md.
List all tasks where status is pending and all depends_on are status: done.
Sort by week (earliest first), then priority (P1 first).
Tell me the top 3 unblocked tasks to work on next.
```

---

## 7. Definition of Done

A task is `status: done` when ALL of the following are true:
- [ ] All checkboxes in the task file are checked
- [ ] Tests written and passing (coverage target met)
- [ ] No P1/P2 lint or type errors (`make lint` green)
- [ ] If `interface_lock` set: public interface exported and committed
- [ ] `make test` green (or the relevant subset)
- [ ] Docker Compose `make dev-up` still succeeds after changes
- [ ] Journey A (`scripts/test_journey_a.py`) still passes if gateway code was touched
- [ ] Journey B (`scripts/test_journey_b.py`) still passes if HITL code was touched

---

## 8. Key Architectural Constants

These values are fixed — **never change without explicit team decision**:

| Constant | Value |
|----------|-------|
| AIMP spec version | `1.0.0-draft` |
| Conformance target | L3 |
| Gateway port | 8080 |
| Console port | 3000 |
| MCP Bridge port | 8090 |
| Postgres port | 5432 |
| Redis port | 6379 |
| MinIO port | 9000 |
| Default media URL TTL | 3600 seconds (1 hour) |
| Audit log signing algorithm | ed25519 |
| Approval token signing algorithm | ed25519 |
| Idempotency retention window | 24 hours |
| Abort acknowledgement SLA | ≤ 3 seconds |
| State-transition telemetry SLA | ≤ 1 second (p99) |
| Gateway p99 latency target | ≤ 300 ms |
| HITL review resolution target | ≤ 30 seconds |
| Minimal adapter LOC target | ≤ 300 LOC |
| Budget warning threshold | 80% consumed |
| Default adapter poll interval | 1 Hz |
| Sensor coalesce rate (SSE) | ≤ 10 Hz per channel per subscriber |
| Job ID format | ULID (CHAR(26)) |
| Quote validity (recommended) | 60 minutes |
| Adapter call timeout default | 30 seconds |
| Circuit-breaker threshold | 3 consecutive failures → 5 min cooldown |
| git-clone-to-running time target | ≤ 10 minutes |
| Reference scenario job success rate in CI | ≥ 99% |
