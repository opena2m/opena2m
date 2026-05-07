---
id: GW-002
title: Gateway HITL, SSE Streams, Webhooks, and FDM Integration
component: Gateway
week: W9-W14
status: pending
priority: P1
hours: 100
depends_on: [GW-001, ADP-001]
blocks: [GW-003, UI-001]
interface_lock: "POST /v1/jobs/{id}/resume shape + SSE event schema — consumed by UI-001 (Review Queue) and GW-003 (policy integration)"
---

# GW-002: Gateway HITL, SSE Streams, Webhooks, and FDM Integration

## Context
This task completes M2 of the PRD. It adds the `AUDITING` state, the `/resume` endpoint, Server-Sent Events telemetry streaming, the webhook dispatcher with retry/DLQ, and integrates the FDM sim adapter (built in ADP-001) end-to-end so Journey B works. After this task, a human can watch a 3D print via the Console, see it pause at 50%, and resume it.

**HIGHEST RISK:** The resume endpoint's optimistic concurrency. Two concurrent resume clicks must result in exactly one success (the second gets `ERR_INVALID_STATE`). The `job_version` field in the request and `version` column in `jobs` implement this — test it explicitly.

## Prerequisites
- [ ] GW-001 done: state machine, DB schema, five core verbs, Print2D sim working
- [ ] ADP-001 done: FDM sim adapter built and compliance-tested; `JobContext.request_human_pause()` interface stable

## Tasks

### Group 01 — Resume Endpoint (16h)
- [ ] **[P1]** `POST /v1/jobs/{job_id}/resume` (`routers/resume.py`): validate job is in `AUDITING`; check `job_version` matches current `jobs.version`; verify `approval_token` if policy requires (use `approval_token.verify()`); apply transition `AUDITING→EXECUTING` (on CONTINUE/ADJUST) or `AUDITING→ABORTING` (on ABORT); for ADJUST: validate `parameter_overrides` against domain schema, apply overrides to adapter context (8h)
- [ ] **[P1]** Approval token single-use enforcement: mark `approval_tokens.used_at` in same transaction as resume; reject if already used (2h)
- [ ] **[P1]** `resume(ADJUST)` parameter validation: fetch domain schema, validate overrides against `parameters` sub-schema; reject changes to `asset`, `logistics`, or any risk-tier-affecting field (3h)
- [ ] **[P2]** `job_version` mismatch response: return `ERR_INVALID_STATE` with `details.current_version` so client can reload and retry with correct version (1h)
- [ ] **[P2]** Timeout handling: if job is in `AUDITING` and `fallback_action` is `ABORT`, a scheduler task auto-aborts after `human_action_required.expires_at` (2h)

### Group 02 — SSE Telemetry Stream (16h)
- [ ] **[P1]** `GET /v1/jobs/{job_id}/stream` (`routers/telemetry.py` extension): FastAPI `StreamingResponse` with `media_type="text/event-stream"`; subscribe to Redis pub/sub channel `job:{job_id}:events`; forward events as SSE `data: {json}\n\n`; support `Last-Event-ID` reconnect (6h)
- [ ] **[P1]** Event types per FR-GW-05 / tech-design §5.6: `state_transition`, `progress_update`, `sensor_threshold_crossed`, `media_captured`, `vision_check_completed`, `budget_warning`, `human_action_required`, `human_action_completed`; each event includes `event`, `job_id`, `at`, and event-specific fields (4h)
- [ ] **[P1]** Adapter → Gateway event pipeline: `JobContext.emit_*()` methods now persist to DB first, then publish to Redis `job:{job_id}:events` channel; SSE broadcaster reads from Redis (3h)
- [ ] **[P2]** Sensor coalescing: Redis-side rate limiter per channel per subscriber — max 10 events/second for `progress_update` and `sensor_*`; `state_transition` never coalesced (3h)

### Group 03 — Webhook Dispatcher (20h)
- [ ] **[P1]** `gateway/app/services/webhook_dispatcher.py`: async task that reads from `webhook_deliveries` queue; HTTP POST to `endpoint.url` with HMAC-SHA256 signed body; mark `delivered_at` on 2xx; retry with exponential backoff (initial 30s, max 24h) on non-2xx; mark `dead=true` after DLQ timeout (8h)
- [ ] **[P1]** HMAC signing: `compute_webhook_signature(hmac_secret, body_bytes) → str`; `X-AIMP-Signature: hmac-sha256={hex}`; `hmac_secret_enc` decrypted at runtime from DB using `AIMP_WEBHOOK_HMAC_KEK` env var (3h)
- [ ] **[P1]** `POST /v1/webhooks` + `GET /v1/webhooks` + `DELETE /v1/webhooks/{id}`: CRUD for webhook endpoints; validate URL reachability on register (3h)
- [ ] **[P1]** Webhook event injection: `emit_*` methods in `JobContext` queue webhook deliveries to subscribed endpoints for relevant event types (3h)
- [ ] **[P2]** Dead-letter store: `webhook_deliveries.dead=true` entries visible in `GET /v1/webhooks/{endpoint_id}/dlq`; manual retry via `POST /v1/webhooks/{endpoint_id}/dlq/{delivery_id}/retry` (3h)

### Group 04 — FDM Adapter Integration (12h)
- [ ] **[P1]** Register `FDMAdapter` in gateway via entry point; verify it loads at startup in Docker Compose (1h)
- [ ] **[P1]** End-to-end Journey B test (`scripts/test_journey_b.py`): discover `fdm-sim-1` → quote → execute with `pause_for_human_at: ["mid_build_50_percent"]` → poll telemetry → wait for `AUDITING` → `POST /resume` with `decision: CONTINUE` → poll to `COMPLETED` (8h)
- [ ] **[P1]** `make test-e2e` includes `test_journey_b.py` in CI (1h)
- [ ] **[P2]** Vision check result visible in telemetry response under `vision_check_results` array (2h)

### Group 05 — Media Storage (8h)
- [ ] **[P1]** `gateway/app/core/object_store.py`: boto3 client wrapper; `upload_media(job_id, channel, data, mime) → storage_key`; `generate_presigned_url(storage_key, ttl_s) → str`; use `jobs/{job_id}/{channel}/{epoch_ms}.{ext}` key convention (4h)
- [ ] **[P1]** `JobContext.emit_media()`: upload bytes to MinIO, insert `telemetry_media` row with storage key and signature, publish SSE `media_captured` event (2h)
- [ ] **[P2]** Media volume quota: reject upload if `telemetry_media` count for job exceeds 1000 (prevent runaway sims) (1h)
- [ ] **[P2]** FDM sim emits actual camera snapshot bytes (grey pixel PNG) to verify media pipeline end-to-end (1h)

### Group 06 — Unit Tests (14h)
- [ ] **[P1]** `tests/unit/test_resume.py`: CONTINUE, ABORT, ADJUST; optimistic lock conflict (two concurrent resumes → one wins); approval token single-use; ADJUST with invalid override rejects; `ERR_INVALID_STATE` on non-AUDITING job (5h)
- [ ] **[P1]** `tests/unit/test_sse.py`: event ordering, reconnect with Last-Event-ID (3h)
- [ ] **[P1]** `tests/unit/test_webhooks.py`: HMAC signature correct; retry on 500; DLQ after max retries (3h)
- [ ] **[P2]** `tests/unit/test_media.py`: upload, presigned URL generation, quota enforcement (3h)

### Group 07 — Integration Tests (14h)
- [ ] **[P1]** `tests/integration/test_journey_b.py`: full Journey B via REST — including AUDITING pause, SSE stream verification, CONTINUE resume, vision check result in telemetry (8h)
- [ ] **[P1]** `tests/integration/test_resume_contention.py`: two simultaneous `/resume` POSTs; assert exactly one 200 and one 409 `ERR_INVALID_STATE` (4h)
- [ ] **[P2]** `tests/integration/test_webhook_delivery.py`: subscribe a local webhook (use `httpretty` or a real test server), execute a job, assert all state-transition webhooks delivered in order with valid HMAC (2h)

## AI Execution Prompt

```
You are a Python/FastAPI engineer adding HITL (human-in-the-loop) support, SSE telemetry streaming, and webhook delivery to the OpenA2M gateway.

TASK: Implement POST /v1/jobs/{id}/resume, GET /v1/jobs/{id}/stream (SSE), webhook dispatcher with retry/DLQ, media storage pipeline, and integrate the FDM simulator adapter end-to-end for Journey B.

STACK: Python 3.12 + FastAPI + SQLAlchemy async + Redis pub/sub + boto3 (MinIO) + cryptography

CRITICAL RULES:
- **HIGHEST RISK:** resume optimistic lock — job_version MUST match; test two-concurrent-resume contention explicitly
- Approval tokens are single-use; mark used_at in the SAME transaction as the state transition
- ADJUST parameter_overrides: validate against domain schema; NEVER allow overrides that change asset identity, delivery destination, or risk-tier fields
- SSE: state_transition events MUST NOT be coalesced; progress/sensor events: ≤ 10 Hz per channel
- Webhook HMAC: sign the exact request body bytes with hmac-sha256 using the decrypted secret

Complete Groups 01–07 in order. Run `cd gateway && python -m pytest tests/ -x` after each group. Report before proceeding.
```

## Expected Outputs
- `gateway/app/routers/resume.py`
- `gateway/app/services/webhook_dispatcher.py`
- `gateway/app/core/object_store.py`
- `gateway/app/routers/webhooks.py`
- `scripts/test_journey_b.py` (complete)

## Verification Checklist
- [ ] `make test-gateway` — all GW-002 tests green
- [ ] Journey B runs end-to-end; job pauses at AUDITING, resumes to COMPLETED
- [ ] Two concurrent `/resume` POSTs: exactly one 200 and one 409
- [ ] SSE stream delivers `human_action_required` event when job enters AUDITING
- [ ] Webhook delivers signed state_transition events with valid HMAC
- [ ] `make test-e2e` includes Journey B and passes ≥ 99% of runs
