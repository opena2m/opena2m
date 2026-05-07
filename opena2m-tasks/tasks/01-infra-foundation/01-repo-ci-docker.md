---
id: INFRA-001
title: Repo, CI, Docker Compose & Seed
component: Infrastructure
week: W1-W2
status: pending
priority: P1
hours: 24
depends_on: []
blocks: [GW-001, ADP-001, UI-001]
interface_lock: "Makefile targets (dev-up, seed, test, lint) are the stable developer contract consumed by all contributors"
---

# INFRA-001: Repo, CI, Docker Compose & Seed

## Context
This task establishes the full local development environment and CI pipeline that every other task depends on. It produces the `Makefile`, `docker-compose.yml`, the GitHub Actions CI workflow, and the `scripts/seed.py` that all later tasks assume are present and working. The success bar is: `git clone → make dev-up → make seed → curl /v1/discover` works.

**Decide on Day 1:** The Makefile is the single developer interface — all CI commands must be wrappers around Makefile targets. Do not expose raw docker / pytest / npm commands in CI; CI calls `make test`, `make lint`, etc.

## Prerequisites
- [ ] Empty repository created and pushed to GitHub
- [ ] Local Docker with Compose v2 available

## Tasks

### Group 01 — Repo Scaffold (4h)
- [ ] **[P1]** Create root `Makefile` with targets: `dev-up`, `dev-down`, `dev-logs`, `dev-ps`, `seed`, `gateway-install`, `gateway-dev`, `gateway-install`, `console-install`, `console-dev`, `test`, `test-gateway`, `test-e2e`, `lint`, `lint-gateway`, `lint-console`, `clean` `Makefile` (2h)
- [ ] **[P1]** Create `deploy/docker-compose.yml` with services: `postgres:16-alpine`, `redis:7-alpine`, `minio/minio`, `gateway` (build: ./gateway), `console` (build: ./console), `mcp-bridge` (build: ./mcp-bridge); set correct `depends_on` and health checks (1.5h)
- [ ] **[P2]** Create `.env.example` at repo root with all required env vars from CONVENTIONS.md; create `.gitignore` covering Python, Node, Docker, IDE, `.env` (0.5h)

### Group 02 — Gateway & Console Skeletons (6h)
- [ ] **[P1]** Create `gateway/` Python project: `requirements.txt`, `pytest.ini` (`asyncio_mode=auto`, `log_cli=true`), `gateway/app/__init__.py`, minimal `gateway/app/main.py` (FastAPI app with `/healthz` and `/readyz` returning 200), `Dockerfile` (python:3.12-slim, uvicorn entrypoint) (2h)
- [ ] **[P1]** Create `console/` Vite+React project: `npm create vite@latest` with React+TypeScript template; configure `vite.config.ts` to proxy `/v1`, `/health`, `/capabilities` to `localhost:8080`; add `tailwind.config.js`, `postcss.config.js`, placeholder `App.tsx` (2h)
- [ ] **[P1]** Create `adapter-sdk/` package stub: `aimp_sdk/__init__.py`, placeholder `base.py`, `setup.py` with entry-point group `aimp.adapters` declared, `tests/` directory with placeholder test (1h)
- [ ] **[P2]** Create `mcp-bridge/` stub: `server.py` (empty FastAPI app), `requirements.txt`, `Dockerfile` (1h)

### Group 03 — CI Pipeline (6h)
- [ ] **[P1]** Create `.github/workflows/ci.yml`: on push/PR to `main`; jobs: `lint-gateway` (`make lint-gateway`), `lint-console` (`make lint-console`), `test-gateway` (`make test-gateway`), `test-e2e` (bring up Docker Compose, run `make test-e2e`), `validate-schemas` (run schema golden vector validation against `docs/aimp/examples/`) (3h)
- [ ] **[P1]** Add `scripts/validate_schemas.py`: iterate `docs/aimp/examples/*.json`, validate each against the relevant schema in `docs/aimp/schemas/`; exit non-zero on failure (1h)
- [ ] **[P2]** Configure GitHub Actions caching for pip, npm, and Docker layer cache to keep CI under 8 minutes (1h)
- [ ] **[P2]** Add PR template (`.github/pull_request_template.md`) with CI checklist (0.5h)
- [ ] **[P3]** Add Dependabot config for Python and npm (0.5h)

### Group 04 — Seed Script (4h)
- [ ] **[P1]** Create `scripts/seed.py`: idempotent script that uses the Gateway REST API to register: 2 reference devices (`cloudprint-sim-1` domain `manufacturing.print.2d.v1`, `fdm-sim-1` domain `manufacturing.additive.fdm.v1`), 4 policies (default-deny-hazardous, restricted-needs-hitl, budget-alice, allow-poster-agent-print2d), 1 agent principal (`agent://alice/poster-agent`) + bearer token, 1 human principal (`human://bob@fab`) + OIDC stub (2h)
- [ ] **[P1]** `make seed` target calls `scripts/seed.py`; must be idempotent (safe to run on existing DB) (0.5h)
- [ ] **[P2]** Add `scripts/test_journey_a.py` stub (discover → returns 200 placeholder) (0.5h)
- [ ] **[P2]** Add `scripts/test_journey_b.py` stub (placeholder) (0.5h)
- [ ] **[P2]** Add `make discover` and `make health` targets for quick manual smoke tests (0.5h)

### Group 05 — Testing (4h)
- [ ] **[P1]** Verify `make dev-up` starts all services and all healthchecks pass (1h)
- [ ] **[P1]** Verify `make seed` runs without error on fresh DB and is idempotent on re-run (0.5h)
- [ ] **[P1]** CI workflow runs on a PR and all jobs pass (1h)
- [ ] **[P1]** `scripts/validate_schemas.py` validates all 3 example files in `docs/aimp/examples/` (0.5h)
- [ ] **[P2]** Document `make dev-up → make seed → curl /v1/healthz` smoke test in README.md (1h)

## AI Execution Prompt

```
You are a DevOps engineer setting up the OpenA2M project infrastructure.

TASK: Create the repo skeleton, Makefile, Docker Compose, CI pipeline, and seed script for OpenA2M — a Python/FastAPI gateway + React console + adapter SDK stack.

STACK:
- Python 3.12 + FastAPI (gateway), Node 20 + React 18 + Vite (console)
- Docker Compose v2 with postgres:16-alpine, redis:7-alpine, minio/minio, gateway, console, mcp-bridge
- GitHub Actions CI
- Makefile as the single developer interface

CRITICAL RULES:
- make dev-up must bring up all 6 services from zero; all healthchecks must pass
- make seed must be idempotent — safe to re-run; uses Bearer token auth against /v1 endpoints
- All CI jobs call make targets — never raw commands
- .env.example must document every env var in CONVENTIONS.md; actual .env is gitignored
- Gateway skeleton: /healthz returns 200 JSON; that's all — no business logic yet

Complete Groups 01–05 in order. After each group:
1. Run the relevant make target to verify it works
2. Check off completed items
3. Report what you completed before moving to the next group
```

## Expected Outputs
- `Makefile`
- `deploy/docker-compose.yml`
- `.env.example`
- `gateway/app/main.py` (healthz skeleton)
- `gateway/Dockerfile`
- `gateway/requirements.txt`
- `gateway/pytest.ini`
- `console/vite.config.ts`
- `adapter-sdk/aimp_sdk/base.py` (stub)
- `adapter-sdk/setup.py`
- `mcp-bridge/server.py` (stub)
- `.github/workflows/ci.yml`
- `scripts/seed.py`
- `scripts/validate_schemas.py`
- `scripts/test_journey_a.py` (stub)
- `scripts/test_journey_b.py` (stub)

## Verification Checklist
- [ ] `make dev-up` succeeds; `docker compose ps` shows all 6 services healthy
- [ ] `curl http://localhost:8080/healthz` returns 200
- [ ] `make seed` completes without errors
- [ ] `make seed` (second run) completes without errors (idempotency)
- [ ] `make lint-gateway` and `make lint-console` pass on the stubs
- [ ] GitHub Actions CI workflow triggers on a test PR and all jobs green
- [ ] `scripts/validate_schemas.py` validates all example files
- [ ] No `.env` file committed; `.env.example` present

## Notes
- `make dev-up` must work on Apple Silicon (arm64) — ensure postgres/redis/minio images are multi-arch
- MinIO startup command: `server /data --console-address ":9001"`
- Gateway Dockerfile: use `python:3.12-slim`, install requirements, run `uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload`
- The seed script will fail until GW-001 implements the admin endpoints — that's expected; the seed stub just needs to exist
