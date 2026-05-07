---
id: UI-002
title: Console Advanced — Policy, Budget, Audit, Domains, Settings
component: Operator Console
week: W18-W22
status: in-progress
priority: P1
hours: 80
depends_on: [GW-003, UI-001]
blocks: [MCP-001]
---

# UI-002: Console Advanced — Policy, Budget, Audit, Domains, Settings

## Context
This task completes the full Console feature set needed for M3 and M4 conformance: the policy editor with dry-run panel, the budget overview with time-series chart, the audit log viewer with signed export, domain/adapter management, and Settings (signing key management, user list, webhook config). These pages require the GW-003 API to be stable.

**Decide on Day 1:** Policy and budget CRUD are admin-only operations. The Console must check the current user's principal kind (`human`) and role before rendering edit affordances. Read-only views are available to all authenticated users.

## Prerequisites
- [x] GW-003 done: policy engine, budget engine, audit log, OIDC — all API endpoints stable
- [x] UI-001 done: AppShell, dataLayer pattern, shared components established

## Tasks

### Group 01 — dataLayer Extensions (6h)
- [x] **[P1]** Extend `lib/dataLayer.ts`: add `getPolicies()`, `getPolicy(id)`, `createPolicy(yaml)`, `updatePolicy(id, yaml)`, `dryRunPolicy(id, request)`, `getBudgets()`, `getBudget(id)`, `createBudget(data)`, `updateBudget(id, data)`, `getAuditLog(filters)`, `exportAuditBundle()`, `getDomains()`, `getDomain(id)`, `getSigningKeys()`, `rotateSigningKey()`, `getWebhookEndpoints()`, `createWebhookEndpoint(data)`, `deleteWebhookEndpoint(id)` (4h)
- [x] **[P1]** Extend `lib/mockData.ts` with mock responses for all new functions (2h)

### Group 02 — Policy Pages (14h)
- [x] **[P1]** `pages/Policies.tsx`: list of policies with name, enabled/disabled toggle, last updated, rule count; New Policy button (3h)
- [x] **[P1]** `pages/PolicyDetail.tsx`: YAML editor (use `@monaco-editor/react` or `CodeMirror`) for policy rules; Save button; Enable/Disable toggle; **Dry-Run panel**: request input form (domain, device, amount, risk_tier) → POST to dry_run endpoint → render evaluation trace as collapsible tree (9h)
- [x] **[P2]** Policy validation: parse YAML client-side and show inline errors before submit; debounced validation on keypress (2h)

### Group 03 — Budget Pages (12h)
- [x] **[P1]** `pages/Budgets.tsx`: list of budgets with principal, scope, ceiling, consumed (progress bar), window type + resets_at; New Budget button (3h)
- [x] **[P1]** `pages/BudgetDetail.tsx`: budget edit form (ceiling, window kind, warn threshold, hard_deny toggle); time-series bar chart of daily consumption (Recharts BarChart) using `budget_warning` webhook events or polling; budget utilisation history (7h)
- [x] **[P2]** Budget warning banner: if any budget is > 80% consumed, show a global warning banner in AppShell (2h)

### Group 04 — Audit Log Page (12h)
- [x] **[P1]** `pages/AuditLog.tsx`: paginated table with filters (principal, action, target_kind, since, before); each row shows: sequence, at, principal, action, target, expandable details JSON; infinite scroll via `useInfiniteQuery` (6h)
- [x] **[P1]** Export button: POST to `/v1/audit/export` → download `.jsonl.zst` bundle via `Content-Disposition: attachment` response; show download progress (3h)
- [x] **[P2]** Signature indicator: each row shows a green checkmark if signature is valid (verify in browser using gateway public key from `/v1/gateway.json`); red X if invalid (3h)

### Group 05 — Domains Page (8h)
- [x] **[P1]** `pages/Domains.tsx`: list of loaded adapter domains with name, version, risk tier badge, adapter package, loaded since (2h)
- [x] **[P1]** `pages/DomainDetail.tsx`: collapsible JSON Schema viewer; registered sensors table (channel, unit, required/optional); registered vision checks table; adapter health status (6h)

### Group 06 — Settings Page (12h)
- [x] **[P1]** `pages/Settings.tsx`: tabbed: **Keys** (list signing keys, rotate button — requires confirm; public key download), **Users** (list principals, kind badge, created, last-seen; admin can disable), **Webhooks** (list endpoints, add/delete, test delivery button), **Profile** (current user name, logout) (10h)
- [x] **[P2]** Console signing key setup: generate a Console ed25519 keypair in browser (`crypto.subtle.generateKey`); store private key in sessionStorage (wiped on browser close); upload public key to gateway; used for approval token signing in ReviewDetail (replacing the hardcoded dev key from UI-001) (2h)

### Group 07 — Login Page & OIDC Flow (6h)
- [ ] **[P1]** `pages/Login.tsx`: OIDC redirect button ("Sign in with {provider}"); local-password fallback form if dev mode (3h) ← **NOT DONE: Login.tsx absent**
- [x] **[P1]** Auth guard: `ProtectedRoute` component; redirect to `/login` if no valid token in Zustand store; refresh token on 401 (3h)

### Group 08 — E2E & Accessibility Tests (10h)
- [ ] **[P1]** Playwright E2E: `tests/e2e/journey_d.spec.ts` — navigate to Budgets → find alice's budget → verify consumed shows warning color → find the rejected job in Jobs → verify `ERR_BUDGET_EXCEEDED` error displayed (5h) ← **NOT DONE**
- [ ] **[P1]** Playwright E2E: `tests/e2e/audit_export.spec.ts` — navigate to Audit Log → click Export → verify file downloads (3h) ← **NOT DONE**
- [ ] **[P2]** axe-core accessibility on Policy editor, Budget detail, Settings pages (2h) ← **NOT DONE**

## AI Execution Prompt

```
You are a React/TypeScript engineer adding advanced management pages to the OpenA2M Operator Console.

TASK: Build the Policy editor with dry-run panel, Budget overview with time-series charts, Audit Log viewer with export, Domain/adapter detail pages, and the Settings page (key management, users, webhooks, OIDC login).

STACK: React 18.3 + TypeScript 5.4 + TanStack Query 5 + Tailwind + shadcn/ui + @monaco-editor/react (YAML editor) + Recharts + Playwright

CRITICAL RULES:
- Policy + Budget edit affordances: only render for principal kind=human with admin role; read-only for others
- Dry-run panel: call POST /v1/policies/{id}/dry_run — never side effects; show evaluation trace as collapsible JSON tree
- Console signing key: must be generated in browser (Web Crypto API) and never leave the browser unencrypted
- Audit export: stream the download; do NOT load the full .jsonl.zst into memory
- Settings → Keys rotate: show principal identity + confirm dialog before POSTing

Complete Groups 01–08 in order. After each group: npm run build (no errors), npm run lint, report before proceeding.
```

## Expected Outputs
- `console/src/pages/Policies.tsx`
- `console/src/pages/PolicyDetail.tsx`
- `console/src/pages/Budgets.tsx`
- `console/src/pages/BudgetDetail.tsx`
- `console/src/pages/AuditLog.tsx`
- `console/src/pages/Domains.tsx`
- `console/src/pages/DomainDetail.tsx`
- `console/src/pages/Settings.tsx`
- `console/src/pages/Login.tsx`
- `console/tests/e2e/journey_d.spec.ts`

## Verification Checklist
- [x] `npm run build` — no TypeScript errors
- [x] `npm run lint` — clean
- [x] Policy dry-run panel shows evaluation trace without creating any DB records
- [x] Budget page shows warning for any budget > 80% consumed
- [x] Audit export downloads a file when gateway is running
- [x] Settings → Keys → Rotate shows confirm dialog with current principal identity
- [ ] Playwright journey_d E2E passes against real gateway ← **MISSING: no Playwright tests**
- [ ] axe-core: 0 critical violations on all new pages ← **MISSING**
