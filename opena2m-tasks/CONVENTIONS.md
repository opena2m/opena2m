# OpenA2M — Conventions and Repo Layout

## Repository Structure

```
opena2m/                               ← repo root
├── Makefile                           ← ALL developer workflows
├── CLAUDE.md                          ← AI coding guidance
├── deploy/
│   ├── docker-compose.yml             ← Full stack (postgres, redis, minio, gateway, console, mcp-bridge)
│   └── k8s/                           ← Kubernetes Helm charts / manifests
├── gateway/                           ← Python/FastAPI AIMP gateway service
│   ├── app/
│   │   ├── main.py                    ← FastAPI app entry point
│   │   ├── core/
│   │   │   ├── config.py              ← Pydantic Settings (all env vars)
│   │   │   ├── database.py            ← SQLAlchemy async engine + session factory
│   │   │   ├── auth.py                ← Bearer token verification, principal extraction
│   │   │   ├── state_machine.py       ← Nine-state FSM; owns all transition logic ← CRITICAL
│   │   │   ├── audit.py               ← ed25519 hash-chain audit log writer ← CRITICAL
│   │   │   ├── redis_client.py        ← Async Redis connection + pub/sub helpers
│   │   │   └── tracing.py             ← OpenTelemetry setup
│   │   ├── models/
│   │   │   ├── db.py                  ← SQLAlchemy ORM table definitions
│   │   │   └── schemas.py             ← Pydantic request/response schemas
│   │   ├── routers/                   ← One file per endpoint group
│   │   │   ├── discover.py, quote.py, execute.py, telemetry.py, abort.py, resume.py
│   │   │   ├── jobs.py, devices.py, domains.py
│   │   │   ├── policies.py, budgets.py, audit.py
│   │   │   ├── webhooks.py, metrics.py, auth.py
│   │   │   └── signing_keys.py
│   │   ├── services/
│   │   │   ├── job_service.py         ← Quote→Execute→telemetry→abort orchestration
│   │   │   ├── policy_engine.py       ← 6-step evaluation chain
│   │   │   ├── budget_service.py      ← Reserve / commit / settle lifecycle
│   │   │   ├── adapter_registry.py    ← Entry-point loader + circuit breaker
│   │   │   ├── approval_token.py      ← ed25519 token mint + verify
│   │   │   └── webhook_dispatcher.py  ← Retry queue + DLQ
│   │   └── adapters/                  ← Built-in adapter plugins
│   │       ├── print2d_sim/
│   │       └── fdm_sim/
│   ├── migrations/                    ← Alembic migration files
│   ├── tests/                         ← pytest test suite
│   │   ├── unit/
│   │   └── integration/
│   ├── requirements.txt
│   └── pytest.ini                     ← asyncio_mode=auto
├── console/                           ← React 18 + TypeScript SPA
│   ├── src/
│   │   ├── pages/                     ← One file per route
│   │   ├── components/                ← Shared UI components
│   │   ├── lib/
│   │   │   ├── api.ts                 ← Axios client (singleton) ← touch sparingly
│   │   │   └── dataLayer.ts           ← Switches between real API and mock data ← ONLY data access point
│   │   ├── store/                     ← Zustand global state
│   │   └── i18n/                      ← Translation strings
│   ├── package.json
│   ├── tsconfig.json                  ← strict: true
│   └── vite.config.ts                 ← Proxies /v1, /health, /capabilities → localhost:8080
├── adapter-sdk/                       ← Pip-installable Python adapter SDK
│   ├── aimp_sdk/
│   │   └── base.py                    ← AIMPAdapter base class + context helpers ← INTERFACE LOCK
│   ├── tests/                         ← Compliance test harness
│   └── setup.py
├── mcp-bridge/                        ← MCP server wrapping AIMP REST
│   ├── server.py
│   └── Dockerfile
├── scripts/
│   ├── seed.py                        ← Idempotent device + policy seeding
│   ├── test_journey_a.py              ← E2E: 2D print happy path
│   └── test_journey_b.py              ← E2E: FDM + HITL
└── docs/
    ├── 01-PRD.md
    ├── 02-ui-ux-design.md
    ├── 03-tech-design.md
    └── aimp/                          ← AIMP protocol spec (authoritative)
        ├── en/                        ← §00–§07 normative spec
        ├── schemas/                   ← JSON Schemas (core + domains)
        └── examples/                  ← Request/response examples
```

---

## Naming Conventions

### Files and Directories
- **Directories**: `kebab-case` (console, adapter-sdk, mcp-bridge)
- **Python files**: `snake_case.py`
- **TypeScript modules**: `camelCase.ts`
- **React components**: `PascalCase.tsx`
- **Test files**: `test_*.py` (Python), `*.test.ts` / `*.test.tsx` (TypeScript)
- **DB migration files**: `{sequence}_{description}.py` via Alembic auto-numbering

### Python (Gateway + Adapters + SDK)
- **Classes**: `PascalCase` (e.g. `JobService`, `AIMPAdapter`)
- **Functions / methods**: `snake_case`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Pydantic models**: `PascalCase` + `Request` / `Response` / `Schema` suffix
- **SQLAlchemy models**: `PascalCase` matching the table name in singular (e.g. `Job`, `AuditLog`)
- **Type hints**: required on all function signatures (mypy strict)
- **Async**: all I/O functions are `async def`; never mix sync/async in the same call chain

### TypeScript / React (Console)
- **Types + Interfaces**: `PascalCase` (e.g. `JobSummary`, `TelemetryEvent`)
- **Enums**: `PascalCase` enum name + `PascalCase` members
- **Functions**: `camelCase`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **React components**: `PascalCase`
- **React hooks**: `use` + `PascalCase` (e.g. `useJobStream`, `useReviewQueue`)
- **TanStack Query keys**: `['resource', id, 'sub-resource']` tuple format

### Database (PostgreSQL)
- **Tables**: `snake_case` plural (e.g. `jobs`, `audit_log`, `device_domains`)
- **Columns**: `snake_case`
- **IDs**: `CHAR(26)` ULID strings; column name `{table_singular}_id`
- **Timestamps**: `TIMESTAMPTZ`, column names `{action}_at` (e.g. `created_at`, `updated_at`)
- **JSON columns**: `{name}_json` suffix (e.g. `payload_json`, `audit_requirements_json`)
- **Indexes**: `{table}_{columns}_idx`

### API Routes (AIMP + Admin)
- All under `/v1/`
- Core verbs: `POST /v1/discover`, `POST /v1/quote`, `POST /v1/execute`
- Job sub-resources: `GET /v1/jobs/{id}/telemetry`, `POST /v1/jobs/{id}/abort`, `POST /v1/jobs/{id}/resume`, `GET /v1/jobs/{id}/stream`
- Admin resources: plural nouns `GET /v1/policies`, `GET /v1/budgets`, `GET /v1/devices`
- Audit export: `POST /v1/audit/export`
- Health: `GET /healthz`, `GET /readyz` (not under `/v1`)

---

## Code Quality Standards

### Python (Gateway + SDK)
- `mypy --strict` on `gateway/app/` — no `Any` without explicit `# type: ignore` comment explaining why
- `ruff check` — enforced in CI; no ignored rules without comment
- All external inputs validated via Pydantic v2 models; never access `request.json()` raw
- No `print()` — use `structlog` structured logger throughout
- Every `async def` that does I/O must have a timeout; never await without one in production paths
- Exceptions: always raise `HTTPException` with the AIMP error envelope; no bare `raise Exception()`

### TypeScript (Console)
- `"strict": true` in tsconfig — no exceptions
- No `any` — use `unknown` and narrow, or use generated types from Gateway OpenAPI
- `lib/dataLayer.ts` is the only module allowed to call `lib/api.ts`; all other files call dataLayer
- All async state via TanStack Query; never use `useState` + `useEffect` for server data
- Skeleton components required for all data-fetching states; never show blank content while loading
- Error boundaries required on all page-level components

### Testing
- **Gateway unit**: pytest + pytest-asyncio; ≥ 90% line coverage on `gateway/app/core/` and `gateway/app/services/`
- **Gateway integration**: Docker Compose up + real Postgres + Redis; full journey scripts must pass
- **Adapter compliance**: `adapter-sdk/tests/` harness drives adapters through all state transitions; reference adapters must pass 100%
- **Console unit**: Vitest + React Testing Library for utility functions and hooks
- **Console E2E**: Playwright for Journey A, B, D flows + HITL Review Queue
- **Schema golden vectors**: every file in `docs/aimp/examples/` is validated against the JSON Schemas on every CI run

### Git Workflow
- **Branch naming**: `feat/{ticket-id}-short-description`, `fix/{ticket-id}-description`
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`)
- **PRs require**: CI green + `make lint` green + `make test` green + 1 reviewer
- **Merge strategy**: Squash merge to `main`

---

## Environment Variables

All services use 12-factor configuration. Validate all required vars at startup via Pydantic Settings (gateway) or Zod (console if needed). Secrets are never committed.

```env
# ── Gateway — required ───────────────────────────────
AIMP_DB_URL=postgresql+asyncpg://user:pass@localhost:5432/opena2m_dev
AIMP_REDIS_URL=redis://localhost:6379/0
AIMP_OBJECT_STORE_ENDPOINT=http://localhost:9000
AIMP_OBJECT_STORE_BUCKET=aimp-media
AIMP_OBJECT_STORE_KEY_ENV=AIMP_OBJECT_STORE_ACCESS_KEY   # indirection
AIMP_OBJECT_STORE_ACCESS_KEY=minioadmin
AIMP_OBJECT_STORE_SECRET_KEY=minioadmin
AIMP_AUDIT_PRIVATE_KEY_PATH=/run/secrets/audit_ed25519.pem
AIMP_BASE_URL=http://localhost:8080

# ── Gateway — auth ───────────────────────────────────
AIMP_JWT_SECRET=dev-jwt-secret-change-in-prod
AIMP_DEV_TOKEN=dev-token                        # insecure dev-only bypass
AIMP_OIDC_ISSUER=https://your-oidc-provider
AIMP_OIDC_CLIENT_ID=opena2m-console
AIMP_OIDC_CLIENT_SECRET_ENV=AIMP_OIDC_CLIENT_SECRET

# ── Gateway — optional ───────────────────────────────
AIMP_LOG_LEVEL=info
AIMP_OTEL_ENDPOINT=http://localhost:4317
AIMP_WEBHOOK_HMAC_KEK=dev-kek-change-in-prod    # encrypts hmac secrets at rest
AIMP_MEDIA_URL_TTL_SECONDS=3600

# ── Console (Vite) ───────────────────────────────────
VITE_API_BASE_URL=http://localhost:8080          # only for non-proxied deployments
```

---

## Port Allocation

| Service | Local Port |
|---------|-----------|
| Gateway | 8080 |
| Console | 3000 |
| MCP Bridge | 8090 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |
