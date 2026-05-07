---
id: GW-003
title: Policy Engine, Budget Engine, Audit Log & OIDC
component: Gateway
week: W14-W20
status: in-progress
priority: P1
hours: 120
depends_on: [GW-002]
blocks: [UI-002, MCP-001]
interface_lock: "Policy YAML grammar + GET /v1/policies response shape + POST /v1/policies/{id}/dry_run — consumed by UI-002 (policy editor) and MCP-001"
---

# GW-003: Policy Engine, Budget Engine, Audit Log & OIDC

## Context
This task completes M3 of the PRD. It delivers the full policy enforcement chain (6-step evaluation from AIMP §04.3), declarative YAML policies, the budget lifecycle (reserve/commit/settle with principal-scoped ceilings), the hash-chained ed25519 audit log with export + verify CLI, and OIDC login for the Console. Journey D (runaway budget) and audit-export verification must pass in CI after this task.

**Decide on Day 1:** The policy evaluator runs at `quote` time (not just `execute`). Some checks (budget, HITL approval required) must block the quote itself. This means GW-001's quote router needs a hook for the policy engine — stub it in GW-001 if not yet done.

**HIGHEST RISK:** Budget reserve/commit/settle — race condition where two concurrent jobs both pass the budget check then both reserve, pushing total over ceiling. Use `SELECT FOR UPDATE` on the `budgets` row during the reserve step.

## Prerequisites
- [x] GW-002 done: full state machine, all five verbs, approval token infrastructure, webhook dispatcher
- [x] `audit_log` table and `apply_transition()` already writing entries (from GW-001)

## Tasks

### Group 01 — Policy Engine (24h)
- [x] **[P1]** `gateway/app/services/policy_engine.py`: `evaluate(principal, domain, device_id, quote_amount, asset_hash) → PolicyDecision`; runs 6-step chain from tech-design §8.2: `domain_permission`, `device_access`, `risk_tier_allowed`, `budget_available` (calls budget_service), `approval_required`, `asset_policy`; returns `ALLOW`, `DENY`, or `REQUIRE_APPROVAL` with the matched rule path and full evaluation trace (12h)
- [x] **[P1]** Policy YAML parsing: Pydantic model for policy rules (`when` conditions: `risk_tier`, `domain_match` glob, `principal_kind`, `amount_gte`; `decision`: ALLOW/DENY/REQUIRE_APPROVAL; `approvals` list with `principal_kind + role`); load from `policies` DB table, in-memory cache with hot-reload on `PUT /v1/policies/{id}` (6h)
- [x] **[P1]** Policy evaluation trace persisted to `policy_evaluations` table per evaluation (2h)
- [x] **[P1]** Wire policy engine into `POST /v1/quote` and `POST /v1/execute` (hook stub from GW-001 now fully connected) (2h)
- [x] **[P2]** `POST /v1/policies/{id}/dry_run`: evaluate a hypothetical request without persisting; return trace JSON (2h)

### Group 02 — Policy CRUD API (10h)
- [x] **[P1]** `GET /v1/policies`, `POST /v1/policies`, `GET /v1/policies/{id}`, `PUT /v1/policies/{id}`, `DELETE /v1/policies/{id}` (`routers/policies.py`): full CRUD; validate YAML on write; Admin-only (check principal kind = `human` with `admin` role) (6h)
- [x] **[P2]** Policy version history: each PUT increments `policies.version`; log old YAML in audit entry (2h)
- [x] **[P2]** Default seed policies: `make seed` inserts the 4 reference policies from tech-design §15.1 (2h)

### Group 03 — Budget Engine (20h)
- [x] **[P1]** `gateway/app/services/budget_service.py`: `check_and_reserve(budget_id, amount) → ReservationToken` — `SELECT FOR UPDATE` on budget row, check `consumed + amount ≤ ceiling`, increment consumed, return token; `commit(token)` — mark as committed (immutable); `release(token)` — decrement consumed (on ABORTED/FAILED before commit); `settle(token, actual_amount)` — adjust consumed by (actual - reserved) delta (10h)
- [x] **[P1]** Budget evaluation wired into policy engine step 4: `budget_available` calls `budget_service.check_and_reserve()`; if ceiling exceeded, return `ERR_BUDGET_EXCEEDED` with remaining amount in details (3h)
- [x] **[P1]** `budget_warning` webhook event at 80% consumed; `budget_exhausted` event at 100% (2h)
- [x] **[P1]** Budget window reset: background scheduler task (`asyncio.create_task` at startup) rolls `window_starts_at` + resets `consumed=0` at window boundary (3h)
- [x] **[P1]** `GET /v1/budgets`, `POST /v1/budgets`, `GET /v1/budgets/{id}`, `PUT /v1/budgets/{id}` CRUD (2h)

### Group 04 — Audit Log Hardening + Export (20h)
- [x] **[P1]** Audit log is already written by GW-001's `apply_transition()`; this group hardens it: load ed25519 private key from `AIMP_AUDIT_PRIVATE_KEY_PATH` at startup; verify key can sign/verify before accepting traffic (2h)
- [x] **[P1]** `GET /v1/audit` with filters: `principal_id`, `action`, `target_kind`, `target_id`, `since`, `before_id`; paginated via `before_id` cursor (4h)
- [x] **[P1]** `GET /v1/audit/{id}`: single entry with base64-encoded signature (1h)
- [x] **[P1]** `POST /v1/audit/export`: stream `.jsonl.zst` of all signed rows + `manifest.json` (gateway public key fingerprint, last row signature, schema version); return as `Content-Disposition: attachment` zip (6h)
- [ ] **[P1]** `gateway/app/cli/audit_verify.py`: standalone CLI (`python -m gateway.cli.audit_verify bundle.zip`) that walks the hash chain and reports tamper detection; used in `make audit-verify` target (5h) ← **NOT DONE: cli/ directory absent**
- [x] **[P2]** Key rotation: `POST /v1/signing_keys` (admin) generates a new keypair; new key becomes signing key; old keys remain verification-only; export manifests include full key fingerprint set (2h)

### Group 05 — OIDC Login (12h)
- [ ] **[P1]** Replace OIDC stubs from GW-001 with real implementation: `POST /v1/auth/login` redirects to OIDC provider; `GET /v1/auth/callback` exchanges code for tokens, upserts principal by `sub`, creates session token; `POST /v1/auth/logout` revokes session (8h) ← **NOT DONE: stubs still return 501**
- [ ] **[P1]** Console session: `Authorization: Bearer {session_token}` in subsequent API calls; session stored in `api_tokens` table with `expires_at` = OIDC `exp` (2h) ← **NOT DONE**
- [x] **[P2]** Local-password fallback for dev/air-gapped: if `AIMP_DEV_PASSWORD` set, `POST /v1/auth/login/local` accepts `{username, password}` and creates a dev session (2h)

### Group 06 — Journey D (Budget Runaway) E2E (8h)
- [ ] **[P1]** `scripts/test_journey_d.py`: set $20 daily budget for alice; submit 5 jobs at $5 each; 4th job triggers warning webhook; 5th job is rejected at quote time with `ERR_BUDGET_EXCEEDED` (6h) ← **NOT DONE**
- [ ] **[P1]** `make test-e2e` includes `test_journey_d.py` (1h) ← **NOT DONE**
- [ ] **[P2]** Audit export verified: `make audit-verify` passes on the exported bundle from journey_d run (1h) ← **BLOCKED: audit_verify.py not yet created**

### Group 07 — Unit Tests (16h)
- [x] **[P1]** `tests/unit/test_policy_engine.py`: ALLOW path; DENY on domain not in scope; REQUIRE_APPROVAL on restricted risk tier; dry_run returns same trace as live (6h)
- [x] **[P1]** `tests/unit/test_budget_service.py`: reserve succeeds; reserve fails at ceiling; concurrent reserves (two threads race, only one wins); commit; release; settle with overage (6h)
- [ ] **[P1]** `tests/unit/test_audit_chain.py`: chain across 20 entries, tamper row 10, verify detects it; export + re-import; CLI verify (4h) ← **PARTIAL: audit chain tests exist but CLI verify untested (cli absent)**

### Group 08 — Integration Tests (10h)
- [ ] **[P1]** `tests/integration/test_journey_d.py`: full budget runaway scenario (4h) ← **NOT DONE**
- [x] **[P1]** `tests/integration/test_policy_hitl.py`: restricted job → policy returns REQUIRE_APPROVAL → without token: `ERR_APPROVAL_REQUIRED`; with valid token: ALLOW (4h)
- [ ] **[P2]** `tests/integration/test_audit_export.py`: run journey_a, export bundle, verify with CLI, assert 100% hash chain valid (2h) ← **BLOCKED: audit_verify CLI absent**

## AI Execution Prompt

```
You are a Python engineer implementing policy enforcement, budget management, audit log hardening, and OIDC for the OpenA2M gateway.

TASK: Build the 6-step policy evaluation chain, declarative YAML policies with hot-reload, budget reserve/commit/settle lifecycle, hash-chained ed25519 audit log export + CLI verifier, and OIDC login for the Console.

STACK: Python 3.12 + FastAPI + SQLAlchemy async; ed25519 via `cryptography` library; OIDC via `authlib`; zstandard for audit export compression; pytest

CRITICAL RULES:
- **HIGHEST RISK:** budget SELECT FOR UPDATE — concurrent reserves MUST NOT let total consumed exceed ceiling
- Policy engine runs at quote time (not just execute) — budget and approval checks can block quoting
- Audit export CLI must detect a single tampered row in a 100-entry chain
- OIDC: never log the authorization code or access token; redact in structlog
- Policy YAML changes must be hot-reloaded without gateway restart; use an in-memory cache with a reload trigger on PUT

Complete Groups 01–08 in order. Run `cd gateway && python -m pytest tests/ -x` after each group. Report before proceeding.
```

## Expected Outputs
- `gateway/app/services/policy_engine.py`
- `gateway/app/services/budget_service.py`
- `gateway/app/routers/policies.py`
- `gateway/app/routers/budgets.py`
- `gateway/app/routers/audit.py`
- `gateway/app/routers/signing_keys.py`
- `gateway/app/cli/audit_verify.py`
- `scripts/test_journey_d.py`

## Verification Checklist
- [x] `make test-gateway` all green including policy, budget, audit tests
- [ ] `scripts/test_journey_d.py` passes: 5th job rejected at quote time with `ERR_BUDGET_EXCEEDED` ← **MISSING: script not created**
- [ ] `make audit-verify` passes on a fresh journey_a export bundle ← **MISSING: audit_verify.py CLI absent**
- [x] Two concurrent reserve requests: only one succeeds; total consumed stays at ceiling
- [ ] OIDC login flow works in Docker Compose with OIDC stub (dev local-password fallback) ← **MISSING: OIDC stubs return 501**
- [x] Policy dry_run returns identical trace to live evaluation without persisting
