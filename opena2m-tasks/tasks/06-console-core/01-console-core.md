---
id: UI-001
title: Console Core — Dashboard, Jobs, Review Queue
component: Operator Console
week: W6-W14
status: in-progress
priority: P1
hours: 100
depends_on: [GW-001]
blocks: [UI-002]
interface_lock: "lib/dataLayer.ts API shape + shared TypeScript types — consumed by UI-002"
---

# UI-001: Console Core — Dashboard, Jobs, Review Queue

## Context
This task delivers the Console pages needed to supervise and intervene in live jobs — the minimum viable operator UI for M2. It builds against the Gateway API defined by GW-001 (OpenAPI spec locked at W9), but can start earlier (W6) using the mock dataLayer. The highest-priority page is the **Review Queue** (FR-UI-04): per the PRD success metric, a human reviewer must be able to resolve a HITL pause in ≤ 30 seconds without scrolling.

**Decide on Day 1:** `lib/dataLayer.ts` is the single point of truth for all data access. Pages import only from `dataLayer`, never from `api.ts` directly. This enables switching between mock and real data without touching page components.

**HIGHEST RISK:** The Review Queue. It must surface sensor charts, camera thumbnails, and CONTINUE/ABORT/ADJUST affordances on a single screen. Prototype it with mock data and usability-test it at W12 before connecting real API.

## Prerequisites
- [x] GW-001 done: Gateway is running; `gateway/openapi.json` committed (interface lock)
- [x] INFRA-001 done: `make console-dev` works; Vite proxy configured

## Tasks

### Group 01 — App Scaffold (12h)
- [x] **[P1]** React Router DOM 6 routing in `App.tsx`: routes for `/`, `/dashboard`, `/jobs`, `/jobs/:id`, `/devices`, `/devices/:id`, `/review`, `/review/:id`, `/domains`, `/policies`, `/budgets`, `/audit`, `/settings`, `*` (NotFound) (2h)
- [x] **[P1]** `console/src/lib/api.ts`: Axios instance with base URL from `vite.config.ts` proxy; `Authorization: Bearer {token}` interceptor (reads from Zustand store); response error interceptor mapping AIMP `ERR_*` codes to user-friendly messages (3h)
- [x] **[P1]** `console/src/lib/dataLayer.ts`: export `getJobs()`, `getJob(id)`, `getJobTelemetry(id)`, `getDevices()`, `getDevice(id)`, `getReviewQueue()`, `resumeJob(id, decision, token, overrides)`, `abortJob(id)`; each function calls real API or returns mock data based on `VITE_USE_MOCK=true` (4h)
- [x] **[P1]** `console/src/lib/mockData.ts`: mock responses for all dataLayer functions; includes a job in AUDITING state with sensor readings and media URL for Review Queue testing (2h)
- [x] **[P1]** `console/src/store/index.ts`: Zustand store with `authToken`, `setAuthToken()`, `currentUser`, `setCurrentUser()` (1h)

### Group 02 — Layout & Shared Components (8h)
- [x] **[P1]** `components/layout/AppShell.tsx`: sidebar nav with links to Dashboard, Jobs, Review Queue (badge with AUDITING count), Devices, Domains, Policies, Budgets, Audit, Settings; top bar with current user + logout (4h)
- [x] **[P1]** `components/shared/StatusBadge.tsx`: colored badge for all 9 job states (2h)
- [x] **[P1]** `components/shared/ErrorBoundary.tsx`: page-level error boundary with retry button (1h)
- [x] **[P2]** `components/shared/SkeletonTable.tsx`, `SkeletonCard.tsx`: loading skeletons for list and detail views (1h)

### Group 03 — Dashboard Page (10h)
- [x] **[P1]** `pages/Dashboard.tsx`: TanStack Query `useQuery` polling every 10s; show: job state distribution (Recharts PieChart or BarChart), device health grid (IDLE/BUSY/OFFLINE per device), review queue depth badge, last 5 completed jobs (6h)
- [x] **[P2]** `pages/Landing.tsx`: welcome page shown before login; quick-start links to docs (1h)
- [x] **[P2]** Dashboard loads within 2s on warm cache (verify with browser DevTools on mock data) (1h)
- [x] **[P2]** Live job counter: SSE `EventSource` on `/v1/jobs/stream` (global stream; if gateway exposes one) or polling fallback (2h)

### Group 04 — Jobs List & Detail (20h)
- [x] **[P1]** `pages/Jobs.tsx`: paginated jobs table (job_id, device, domain, state badge, progress bar, cost, created_at); filter by state, device, principal; `useInfiniteQuery` for load-more pagination (6h)
- [x] **[P1]** `pages/JobDetail.tsx`: tabbed detail view with: **Overview** (state timeline, progress, cost ledger, error if any, tracking if any), **Telemetry** (sensor sparklines via Recharts LineChart), **Media** (camera thumbnail grid), **Audit** (per-job transition log), **Actions** (Abort button with confirm modal; Resume button shown only when state=AUDITING) (12h)
- [x] **[P1]** Abort confirm modal: show principal identity the abort will be performed as; require typing "ABORT" to confirm (per FR-UI-08) (2h)

### Group 05 — Review Queue (20h)
- [x] **[P1]** `pages/Review.tsx`: list of all jobs in AUDITING that the current operator can act on; each row shows device, domain, reason, pause waypoint, time in AUDITING, first camera thumbnail; link to ReviewDetail (4h)
- [x] **[P1]** `pages/ReviewDetail.tsx` ← **THE CRITICAL PAGE**: must fit all decision context on one screen without scroll: job summary at top, sensor readings at time of pause (last 5 readings per channel), camera snapshot carousel, vision check verdict (pass/warn/failure badge + confidence), CONTINUE / ABORT / ADJUST tabs; ADJUST tab shows domain parameter overrides (within schema bounds); sign and POST to `/resume` (14h)
- [x] **[P1]** Approval token signing in browser: `TextEncoder` + `crypto.subtle.sign` (ed25519) with a Console signing key loaded from Settings; token bound to `job_id` + `valid_until = now+5min`; full token sent in resume request body (2h)

### Group 06 — Devices List (8h)
- [x] **[P1]** `pages/Devices.tsx`: device list with status (IDLE/BUSY/OFFLINE), domain badge, queue depth, last-seen; search by name (3h)
- [x] **[P2]** `pages/DeviceDetail.tsx`: capability schema viewer (JSON tree or formatted table), registered sensors list, recent jobs for this device (5h)

### Group 07 — Unit & E2E Tests (22h)
- [x] **[P1]** Vitest + React Testing Library: `dataLayer.test.ts` — verify all mock functions return correctly typed data; `StatusBadge.test.tsx` — all nine states render correct color class (4h)
- [ ] **[P1]** Playwright E2E: `tests/e2e/journey_a.spec.ts` — navigate to Dashboard → Jobs → find completed job → open detail → verify state = COMPLETED and cost visible (5h) ← **NOT DONE: no Playwright tests exist**
- [ ] **[P1]** Playwright E2E: `tests/e2e/review_queue.spec.ts` — mock an AUDITING job → open Review Queue → open ReviewDetail → click CONTINUE → verify job card disappears from queue; full flow must complete in < 30s per PRD metric (8h) ← **NOT DONE**
- [ ] **[P1]** Playwright E2E: `tests/e2e/abort.spec.ts` — open a running job → click Abort → confirm modal → verify job state changes to ABORTING (3h) ← **NOT DONE**
- [ ] **[P2]** axe-core accessibility check on Dashboard, Jobs, Review Queue pages; assert 0 critical violations (2h) ← **NOT DONE**

## AI Execution Prompt

```
You are a React/TypeScript engineer building the OpenA2M Operator Console — a web UI for supervising AIMP jobs on physical machines.

TASK: Build the Console Core: app scaffold with routing, lib/dataLayer.ts data access layer, Dashboard, Jobs list + detail, and the Review Queue (the most critical page — must allow HITL resolution in ≤ 30s).

STACK: React 18.3 + TypeScript 5.4 strict + Vite 5 + React Router DOM 6 + TanStack Query 5 + Zustand + Tailwind CSS 3 + shadcn/ui + Recharts + Lucide icons + Playwright + Vitest

CRITICAL RULES:
- lib/dataLayer.ts is the ONLY module allowed to call lib/api.ts — ALL pages import from dataLayer
- All async data via TanStack Query useQuery/useMutation — never useState + useEffect for server data
- Review Queue (ReviewDetail) MUST fit all decision context on one viewport without scroll — test at 1280×768
- Abort requires typing "ABORT" in a confirm modal per FR-UI-08 — no one-click destructive actions
- Skeleton loading states required on every page while data fetches
- Approval token signing: use Web Crypto API (SubtleCrypto) ed25519; never send the signing key to the backend

Complete Groups 01–07 in order. After each group:
1. Run `cd console && npm run build` — no type errors
2. Run `npm run lint` — no ESLint errors
3. Check off items and report before proceeding
```

## Expected Outputs
- `console/src/App.tsx`
- `console/src/lib/api.ts`
- `console/src/lib/dataLayer.ts` ← **INTERFACE LOCK**
- `console/src/lib/mockData.ts`
- `console/src/store/index.ts`
- `console/src/pages/Dashboard.tsx`
- `console/src/pages/Jobs.tsx`
- `console/src/pages/JobDetail.tsx`
- `console/src/pages/Review.tsx`
- `console/src/pages/ReviewDetail.tsx`
- `console/src/pages/Devices.tsx`
- `console/src/components/layout/AppShell.tsx`
- `console/tests/e2e/journey_a.spec.ts`
- `console/tests/e2e/review_queue.spec.ts`

## Verification Checklist
- [x] `npm run build` — no TypeScript errors
- [x] `npm run lint` — no ESLint errors
- [x] Review Queue → ReviewDetail → CONTINUE: complete flow in < 30s on mock data
- [x] Abort confirm: modal requires typing "ABORT" before button enables
- [ ] Playwright journey_a E2E passes against real gateway (`make dev-up`) ← **MISSING: no Playwright tests**
- [ ] Playwright review_queue E2E passes on mock data ← **MISSING**
- [ ] axe-core: 0 critical accessibility violations on Dashboard and Review pages ← **MISSING**

## Notes
- Start Group 01–04 using mock dataLayer (W6–W9) while GW-001 and GW-002 are in progress
- Switch to real API once `gateway/openapi.json` is committed (W9) and GW-002 SSE is available
- ReviewDetail approval token signing: generate a dev Console keypair in Settings (UI-002) for production; for UI-001, use a hardcoded dev key from env
