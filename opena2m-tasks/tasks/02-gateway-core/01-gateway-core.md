---
id: GW-001
title: Gateway Core — State Machine, DB, Auth, AIMP Core Verbs
component: Gateway
week: W2-W9
status: pending
priority: P1
hours: 200
depends_on: [INFRA-001]
blocks: [GW-002, GW-003, UI-001, MCP-001]
interface_lock: "Gateway REST API OpenAPI spec v1 (/v1/discover, /v1/quote, /v1/execute, /v1/jobs/{id}/telemetry, /v1/jobs/{id}/abort) must be stable by end W9 — consumed by UI-001 and MCP-001"
---

# GW-001: Gateway Core — State Machine, DB, Auth, AIMP Core Verbs

## Context
This is the largest and most critical task in the project. It delivers the complete AIMP protocol surface for M1: the Postgres schema (all tables from tech-design §4.1), the nine-state job FSM, bearer auth, and the five core AIMP verbs (`discover`, `quote`, `execute`, `telemetry`, `abort`). Everything downstream — FDM adapter, HITL resume, Console, MCP Bridge — is blocked until this task is done and its API is locked.

**Decide on Day 1:** Use SQLite (`aiosqlite`) as the default dev DB (no Postgres needed for unit tests) and Postgres in Docker Compose (integration tests). The `AIMP_DB_URL` env var switches between them. This is already the design in `gateway/app/core/config.py`.

**HIGHEST RISK:** `state_machine.py` — any bug in transition validation will corrupt job state and audit chain. Complete Group 03 (state machine) before writing any router. Every transition must match the table in tech-design §6.2 exactly.

## Prerequisites
- [ ] INFRA-001 done: `make dev-up` works, Docker Compose up, `gateway/app/main.py` skeleton exists
- [ ] `docs/aimp/schemas/core/` JSON Schema files present (used as golden vectors)

## Tasks

### Group 01 — Project Setup & Config (8h)
- [ ] **[P1]** `gateway/app/core/config.py`: Pydantic Settings with all env vars from CONVENTIONS.md; validate at startup; include `AIMP_DB_URL` (defaults to `sqlite+aiosqlite:///./dev.db`), `AIMP_REDIS_URL`, object store, JWT, OIDC, audit key path (2h)
- [ ] **[P1]** `gateway/app/core/database.py`: async SQLAlchemy engine factory, `get_session()` dependency, `Base` declarative base (1.5h)
- [ ] **[P1]** `gateway/app/core/redis_client.py`: async Redis connection pool; `get_redis()` dependency; `publish(channel, payload)` and `subscribe(channel)` helpers (1.5h)
- [ ] **[P1]** Pydantic v2 settings validation: raise `ValueError` with a clear message if required vars missing at startup (1h)
- [ ] **[P2]** `gateway/app/core/tracing.py`: OpenTelemetry SDK init (OTLP exporter optional; no-op if `AIMP_OTEL_ENDPOINT` unset) (1h)
- [ ] **[P2]** Structured logging via `structlog` configured in `main.py`; redact `Authorization` headers and secret fields (1h)

### Group 02 — Data Model & Migrations (20h)
- [ ] **[P1]** `gateway/app/models/db.py`: SQLAlchemy ORM for ALL tables from tech-design §4.1: `principals`, `api_tokens`, `domains`, `devices`, `device_domains`, `quotes`, `jobs`, `job_state_transitions`, `telemetry_sensor`, `telemetry_media`, `vision_checks`, `policies`, `policy_evaluations`, `budgets`, `approval_tokens`, `audit_log`, `webhook_endpoints`, `webhook_deliveries` (8h)
- [ ] **[P1]** Alembic init: `alembic init migrations`; configure `env.py` to use async engine + `Base.metadata` (1h)
- [ ] **[P1]** First migration: `alembic revision --autogenerate -m "initial_schema"`; verify SQL matches tech-design §4.1 exactly (2h)
- [ ] **[P1]** `gateway/app/models/schemas.py`: Pydantic v2 request/response models for: `DiscoverRequest/Response`, `QuoteRequest/Response`, `ExecuteRequest/Response`, `TelemetryResponse`, `AbortRequest/Response`, `JobSummary`, `ErrorEnvelope` (6h)
- [ ] **[P2]** Add DB indexes from tech-design: `jobs_state_updated_idx`, `jobs_device_updated_idx`, `jobst_job_at_idx`, `tele_sensor_job_at_idx`, `audit_target_idx` (1h)
- [ ] **[P2]** `scripts/validate_schemas.py` update: also validate Pydantic schemas match AIMP JSON Schema golden vectors (2h)

### Group 03 — State Machine (16h)
- [ ] **[P1]** `gateway/app/core/state_machine.py`: implement nine-state FSM (`PENDING`, `QUOTED`, `LOCKED`, `EXECUTING`, `AUDITING`, `FULFILLING`, `COMPLETED`, `ABORTING`, `ABORTED`, `FAILED`); `validate_transition(from_state, to_state, trigger)` raises `InvalidTransitionError` for illegal moves; implements the full transition table from tech-design §6.2 (6h)
- [ ] **[P1]** `apply_transition(session, job, to_state, by_principal, reason, details)`: atomic function that: updates `jobs.state` + `jobs.version`, inserts `job_state_transitions` row, inserts `audit_log` row — all in one transaction with `FOR UPDATE` on the prior audit row to maintain hash chain (5h)
- [ ] **[P1]** `gateway/app/core/audit.py`: ed25519 sign/verify helpers; `compute_audit_signature(private_key, prev_hash, canonical_row)` → bytes; `load_signing_key()` from path in config (3h)
- [ ] **[P2]** Optimistic concurrency: `apply_transition` checks `jobs.version == expected_version`; raises `VersionConflictError` if mismatch → caller receives `ERR_INVALID_STATE` with current version in details (2h)

### Group 04 — Authentication & Principals (12h)
- [ ] **[P1]** `gateway/app/core/auth.py`: `verify_bearer_token(token) → Principal`; lookup `api_tokens` by `sha256(token)`, check not revoked/expired, return principal (3h)
- [ ] **[P1]** FastAPI `Depends(get_current_principal)` — reusable dependency for all protected routes (1h)
- [ ] **[P1]** Dev token bypass: if `AIMP_DEV_TOKEN` set and token matches, return a built-in `system` principal (insecure, dev-only, log a warning) (1h)
- [ ] **[P1]** `POST /v1/oauth/token`: client-credentials grant; create `api_tokens` row; return short-lived bearer token (3h)
- [ ] **[P2]** OIDC stub: `POST /v1/auth/login`, `GET /v1/auth/callback`, `POST /v1/auth/logout` — return 501 Not Implemented with message "OIDC implemented in M3"; stubs required so Console routing doesn't 404 (2h)
- [ ] **[P2]** `approval_token.py`: `mint_approval_token(private_key, job_id, issuer_id, max_amount, valid_until) → str`; `verify_approval_token(public_key, token, job_id) → ApprovalTokenClaims` (2h)

### Group 05 — Core AIMP Verbs (60h)
- [ ] **[P1]** `POST /v1/discover` (`routers/discover.py`): filter devices by domain/location, hydrate capabilities from `device_domains`, return capability array matching `docs/aimp/schemas/core/capabilities.schema.json` (6h)
- [ ] **[P1]** `POST /v1/quote` (`routers/quote.py`): validate payload against domain JSON Schema (use `jsonschema` Draft 2020-12); call `adapter_registry.get_adapter(domain).quote(ctx)`; create `quotes` row; check budget (stub: always allow); return quote matching `docs/aimp/schemas/core/quote-response.schema.json`; write audit entry (12h)
- [ ] **[P1]** `POST /v1/execute` (`routers/execute.py`): look up quote (check not expired, not already consumed); mark quote consumed; create `jobs` row in `LOCKED` state; call `apply_transition(LOCKED→EXECUTING)` on success of `adapter.start(ctx)`; return execute response with `telemetry_url`, `stream_url` (14h)
- [ ] **[P1]** `GET /v1/jobs/{job_id}/telemetry` (`routers/telemetry.py`): return `TelemetryResponse` per `docs/aimp/schemas/core/telemetry.schema.json`; support `since`, `channels`, `include_media`, `media_ttl_seconds` query params; generate pre-signed media URLs with `media_ttl_seconds` TTL (8h)
- [ ] **[P1]** `POST /v1/jobs/{job_id}/abort` (`routers/abort.py`): abort-primacy — accept regardless of current state (except terminal); call `adapter.abort(ctx)` with timeout; apply `→ABORTING→ABORTED` transitions; return final cost (8h)
- [ ] **[P1]** `GET /v1/jobs/{job_id}` (`routers/jobs.py`): job summary endpoint (4h)
- [ ] **[P1]** `GET /v1/jobs` with filters (`state`, `device_id`, `principal_id`, `since`): paginated list (4h)
- [ ] **[P2]** `GET /v1/devices`, `GET /v1/devices/{id}` (`routers/devices.py`): device list + detail (4h)

### Group 06 — Adapter Registry & Print2D Integration (20h)
- [ ] **[P1]** `gateway/app/services/adapter_registry.py`: scan `aimp.adapters` entry points at startup; call `adapter.register()` for each; store manifest (domain, schema, sensors, vision checks, risk tier); circuit breaker (3 failures → 5 min cooldown per device) (6h)
- [ ] **[P1]** `gateway/app/adapters/print2d_sim/`: complete Print2D simulator adapter — `domain = "manufacturing.print.2d.v1"`, `risk_tier = routine`; `quote()` returns a deterministic cost based on paper size; `start()` emits progress 0→1 over ~5 simulated seconds; `finalize()` emits tracking stub; domain schema at `adapters/print2d_sim/schema.json` (8h)
- [ ] **[P1]** `JobContext` implementation (passed to all adapter calls): wraps DB session + Redis client; exposes `emit_state()`, `emit_sensor()`, `emit_media()`, `emit_vision_verdict()`, `request_human_pause()`, `fail()`, `finalize()` — all route through gateway persistence + pub/sub (6h)

### Group 07 — Management Endpoints (12h)
- [ ] **[P1]** `GET /v1/gateway.json`: return gateway capability doc (AIMP version, loaded domains, conformance level L3, policy summary) (2h)
- [ ] **[P1]** `GET /v1/domains`, `GET /v1/domains/{id}` (`routers/domains.py`): list domains + return JSON Schema + registered sensors + checks (3h)
- [ ] **[P2]** `GET /v1/metrics` (`routers/metrics.py`): Prometheus exposition; counters/histograms for all metrics in tech-design §14 (3h)
- [ ] **[P2]** `GET /healthz`, `GET /readyz`: liveness (always 200) vs readiness (checks DB + Redis) (1h)
- [ ] **[P2]** Admin stubs: `GET/POST /v1/policies`, `GET/POST /v1/budgets` (return empty lists + 501 with "implemented in M3") — stubs prevent Console 404s (3h)

### Group 08 — Journey A End-to-End (12h)
- [ ] **[P1]** Update `scripts/seed.py` to create all required principals, devices, domains, and tokens (3h)
- [ ] **[P1]** Update `scripts/test_journey_a.py` to run the full discover→quote→execute→poll→COMPLETED flow via REST API (5h)
- [ ] **[P1]** `make test-e2e` runs `test_journey_a.py` in CI; pass rate ≥ 99% (2h)
- [ ] **[P2]** Export OpenAPI spec (`gateway/openapi.json`) from FastAPI: `python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" > openapi.json`; commit to repo (2h) ← **INTERFACE LOCK OUTPUT**

### Group 09 — Unit Tests (20h)
- [ ] **[P1]** `tests/unit/test_state_machine.py`: test all valid transitions; test all invalid transitions raise `InvalidTransitionError`; test terminal states reject all transitions; 100% branch coverage on `state_machine.py` (6h)
- [ ] **[P1]** `tests/unit/test_audit.py`: test hash chain integrity across 10 entries; test signature verify; test tamper detection (3h)
- [ ] **[P1]** `tests/unit/test_auth.py`: valid token; expired token; revoked token; dev bypass (2h)
- [ ] **[P1]** `tests/unit/test_quote.py`: valid payload; invalid payload (schema mismatch → ERR_INVALID_PAYLOAD); expired quote reject (3h)
- [ ] **[P1]** `tests/unit/test_abort.py`: abort from EXECUTING, AUDITING, LOCKED; verify abort-primacy (2h)
- [ ] **[P1]** ≥ 90% line coverage on `gateway/app/core/` and `gateway/app/services/` (measured via `pytest --cov`) (4h)

### Group 10 — Integration Tests (16h)
- [ ] **[P1]** `tests/integration/test_journey_a.py`: full Journey A with real Postgres + real Print2D sim via Docker Compose; assert job reaches COMPLETED, audit log has valid hash chain, cost is within quote range (8h)
- [ ] **[P1]** `tests/integration/test_abort.py`: execute a job, abort mid-execution, assert ABORTED state and partial cost (4h)
- [ ] **[P2]** `tests/integration/test_idempotency.py`: POST same execute with same idempotency_key twice; assert second call returns original response without creating a new job (4h)

## AI Execution Prompt

```
You are a Python/FastAPI engineer building the core gateway for OpenA2M — an AIMP protocol implementation.

TASK: Implement the complete Gateway Core: database schema, nine-state FSM, bearer auth, all five AIMP core verbs, Print2D simulator adapter, and management endpoints. This is the largest task; work through groups strictly in order.

STACK:
- Python 3.12 + FastAPI 0.111 + Uvicorn + Pydantic v2 + SQLAlchemy 2.0 async
- asyncpg (Postgres) / aiosqlite (dev SQLite) + Alembic migrations
- redis-py async; cryptography library (ed25519)
- jsonschema Draft 2020-12 for payload validation
- pytest + pytest-asyncio (asyncio_mode=auto); target ≥ 90% coverage on core/ + services/

CRITICAL RULES:
- **HIGHEST RISK:** state_machine.py — all transitions must match tech-design §6.2 exactly; write tests for EVERY transition before moving to Group 05
- apply_transition() must write jobs + job_state_transitions + audit_log in ONE transaction; never update jobs.state outside this function
- Abort is abort-primacy: accepted from any non-terminal state, no approval needed, not rate-limited (spec §04.9)
- All error responses use AIMP error envelope: {"error": {"code": "ERR_...", "category": "...", "retryable": bool, ...}}
- Safety errors (ERR_VISION_AUDIT_FAILED, ERR_UNSAFE_PARAMETER) must have retryable: false

Complete Groups 01–10 in order. After each group:
1. Run `cd gateway && python -m pytest tests/ -x --tb=short`
2. Run `make lint-gateway` (ruff + mypy)
3. Check off completed items and report before proceeding to the next group
```

## Expected Outputs
- `gateway/app/core/config.py`
- `gateway/app/core/database.py`
- `gateway/app/core/state_machine.py`
- `gateway/app/core/audit.py`
- `gateway/app/core/auth.py`
- `gateway/app/core/redis_client.py`
- `gateway/app/models/db.py`
- `gateway/app/models/schemas.py`
- `gateway/app/routers/discover.py`, `quote.py`, `execute.py`, `telemetry.py`, `abort.py`, `jobs.py`, `devices.py`, `domains.py`, `metrics.py`, `auth.py`
- `gateway/app/services/adapter_registry.py`, `job_service.py`, `approval_token.py`
- `gateway/app/adapters/print2d_sim/` (complete adapter)
- `gateway/migrations/` (initial schema migration)
- `gateway/openapi.json` ← **INTERFACE LOCK**
- `scripts/test_journey_a.py` (complete)

## Verification Checklist
- [ ] `make test-gateway` — ≥ 90% coverage on core/ + services/; all tests green
- [ ] `make lint-gateway` — ruff + mypy clean
- [ ] `scripts/test_journey_a.py` runs end-to-end: PENDING→QUOTED→LOCKED→EXECUTING→FULFILLING→COMPLETED
- [ ] Audit log hash chain verifiable by `aimp-audit verify` (to be built in GW-003; chain must be valid)
- [ ] `gateway/openapi.json` committed and valid OpenAPI 3.1
- [ ] Abort returns 202 and job reaches ABORTED within 3 seconds on the sim adapter
- [ ] All AIMP error codes in §06 that apply to these verbs are exercised in tests

## Notes
- SQLite in-process is fine for unit tests; use `pytest-asyncio` with `asyncio_mode=auto`
- For integration tests, use the Docker Compose postgres instance or Testcontainers
- The Print2D sim adapter should simulate a 5-second job with deterministic progress (0.1 per second) for test reliability
- The `openapi.json` interface lock gates UI-001 and MCP-001 — do NOT make breaking changes after W9
