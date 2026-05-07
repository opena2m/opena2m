---
id: ADP-001
title: Adapter SDK v1 + Print2D Sim + FDM Sim
component: Adapter SDK
week: W2-W5
status: pending
priority: P1
hours: 60
depends_on: [INFRA-001]
blocks: [GW-002]
interface_lock: "AIMPAdapter base class API (register, quote, start, poll, abort, finalize, resume), AdapterManifest, JobContext interface must be stable by end W5 — consumed by GW-002 (FDM sim) and any third-party adapters"
---

# ADP-001: Adapter SDK v1 + Print2D Sim + FDM Sim

## Context
The Adapter SDK is the extensibility contract of OpenA2M. It ships as a standalone pip package (`aimp-adapter-sdk`) that any vendor can install to build a domain adapter without touching the gateway. This task delivers: the base class and context interface (`adapter-sdk/aimp_sdk/base.py`), a compliance test harness, the Print2D simulator adapter, and the FDM simulator with mid-build pause and vision check. The PRD success metric is ≤ 300 LOC for a minimal adapter.

**Decide on Day 1:** Adapters run in-process as Python coroutines. The `JobContext` object (provided by the gateway, mocked in tests) is the ONLY channel for all state/sensor/media emissions. Adapters must never import from `gateway.app` — only from `aimp_sdk`.

**HIGHEST RISK:** The `JobContext` interface — it's the integration seam between gateway and adapters. Any method signature change after end W5 is a breaking change for all adapters. Freeze it carefully.

## Prerequisites
- [ ] INFRA-001 done: repo structure in place, `adapter-sdk/` directory exists
- [ ] `docs/aimp/schemas/domains/` JSON Schema files present (Print2D + FDM schemas used for validation)

## Tasks

### Group 01 — SDK Scaffold (6h)
- [ ] **[P1]** `adapter-sdk/aimp_sdk/__init__.py`: export `AIMPAdapter`, `AdapterManifest`, `JobContext`, `SensorSpec`, `VisionCheckSpec`, `RiskTier`, `ResumeDecision`, `Quote`, `QuoteContext`, `VisionVerdict`, `MediaBundle` (1h)
- [ ] **[P1]** `adapter-sdk/setup.py`: package `aimp-adapter-sdk`, version `0.1.0`, entry-point group `aimp.adapters` declared (0.5h)
- [ ] **[P1]** `adapter-sdk/aimp_sdk/types.py`: dataclasses / Pydantic models for `AdapterManifest` (domain, schema_path, sensors, vision_checks, risk_tier, adapter_timeout_s), `SensorReading`, `VisionVerdict`, `Quote`, `QuoteContext`, `JobContext` (abstract base — concrete impl lives in gateway), `ResumeDecision` enum (`CONTINUE`, `ABORT`, `ADJUST`) (3h)
- [ ] **[P2]** `adapter-sdk/README.md`: quickstart showing a 20-line "hello world" adapter (1.5h)

### Group 02 — Base Class (12h)
- [ ] **[P1]** `adapter-sdk/aimp_sdk/base.py`: `AIMPAdapter` abstract base class with: `domain: str`, `schema_path: Path`, `registered_sensors: list[SensorSpec]`, `registered_vision_checks: list[VisionCheckSpec]`, `risk_tier_default: RiskTier`, `adapter_timeout_s: int = 30`; abstract methods: `register() → AdapterManifest`, `quote(ctx: QuoteContext) → Quote`, `start(ctx: JobContext) → None`, `abort(ctx: JobContext) → None`; optional overrides: `poll(ctx: JobContext) → None` (default no-op), `finalize(ctx: JobContext) → None` (default no-op), `resume(ctx: JobContext, decision: ResumeDecision) → None` (default: CONTINUE resumes polling) (6h)
- [ ] **[P1]** `adapter-sdk/aimp_sdk/mock_context.py`: `MockJobContext` implementing `JobContext` for use in tests — records all `emit_*` calls to a list for assertion (4h)
- [ ] **[P2]** `adapter-sdk/aimp_sdk/utils.py`: `simulate_progress(ctx, duration_s, interval_s)` helper that emits progress 0→1 over `duration_s` seconds; useful for sim adapters (2h)

### Group 03 — Print2D Simulator Adapter (12h)
- [ ] **[P1]** `gateway/app/adapters/print2d_sim/__init__.py`: `Print2DAdapter(AIMPAdapter)` with `domain = "manufacturing.print.2d.v1"`, `risk_tier = RiskTier.ROUTINE` (1h)
- [ ] **[P1]** `gateway/app/adapters/print2d_sim/schema.json`: domain JSON Schema (paper_size, paper_stock, dpi, color_mode, copies) matching structure in `docs/aimp/schemas/domains/manufacturing.print.2d.v1.schema.json` (2h)
- [ ] **[P1]** `Print2DAdapter.quote()`: deterministic cost based on paper_size (A4=8.00, A3=12.00, A2=18.00 USD) + copies * paper_stock premium; duration = copies * 30s (2h)
- [ ] **[P1]** `Print2DAdapter.start()`: emit progress 0→1 in 5 steps over simulated time; emit `camera.output_tray` media URL stub; call `ctx.finalize(cost_actual=quote.cost, tracking={"carrier":"sim","number":"SIM-{job_id[:8]}"})` (4h)
- [ ] **[P1]** `Print2DAdapter.abort()`: emit `ctx.emit_state(ABORTING)` then `ctx.emit_state(ABORTED)` immediately (1h)
- [ ] **[P2]** Register adapter in `gateway/app/adapters/print2d_sim/setup.py` entry points (1h)
- [ ] **[P2]** `detect_paper_jam` vision check stub (always returns `pass`, confidence 0.99) for Print2D (1h)

### Group 04 — FDM Simulator Adapter (16h)
- [ ] **[P1]** `gateway/app/adapters/fdm_sim/__init__.py`: `FDMAdapter(AIMPAdapter)` with `domain = "manufacturing.additive.fdm.v1"`, `risk_tier = RiskTier.RESTRICTED` (1h)
- [ ] **[P1]** `gateway/app/adapters/fdm_sim/schema.json`: domain JSON Schema (material_requirement enum, parameters: nozzle_temp_celsius, bed_temp_celsius, infill_percent, layer_height_mm) with bounds from docs spec (2h)
- [ ] **[P1]** `FDMAdapter.quote()`: cost = (infill_percent/100 * 6.00) + (duration_s/60 * 0.05) USD; duration = 60 * nozzle_temp/200 seconds (simulated); material consumption (3h)
- [ ] **[P1]** `FDMAdapter.start()`: simulate a 73-minute print (configurable via env `FDM_SIM_SPEED_FACTOR` for faster tests); emit `extruder_temp` and `chamber.temp` sensor readings every 10s; emit `camera.top` snapshots every 60s; **at progress 0.50** call `ctx.request_human_pause("mid_build_50_percent")` if `audit_requirements.pause_for_human_at` contains `"mid_build_50_percent"` (6h)
- [ ] **[P1]** `FDMAdapter.resume()`: on `CONTINUE` resume progress from 0.50; on `ADJUST` apply `parameter_overrides` (nozzle_temp only); on `ABORT` call abort (2h)
- [ ] **[P1]** `FDMAdapter.abort()`: emit sensor stop, final state (2h)
- [ ] **[P2]** `detect_spaghetti_failure` vision check: if `confidence_override` env var set, use it; otherwise return `inconclusive` for sim (since we have no real camera) (0h — covered above)

### Group 05 — Compliance Test Harness (10h)
- [ ] **[P1]** `adapter-sdk/tests/compliance/test_adapter_lifecycle.py`: parametrised test that drives any `AIMPAdapter` through: `register()` → `quote()` → `start()` → (optionally) `request_human_pause()` → `resume(CONTINUE)` → `finalize()` → asserts all required state emissions happened (6h)
- [ ] **[P1]** `adapter-sdk/tests/compliance/test_abort.py`: drive adapter to EXECUTING state, call `abort()`, assert ABORTED emitted (2h)
- [ ] **[P1]** Run compliance harness against both `Print2DAdapter` and `FDMAdapter` in CI; both must pass 100% (1h)
- [ ] **[P2]** `adapter-sdk/tests/test_mock_context.py`: verify `MockJobContext` records emissions correctly (1h)

### Group 06 — Unit & Integration Tests (4h)
- [ ] **[P1]** `adapter-sdk/tests/unit/test_print2d.py`: quote with all paper sizes, abort, progress emission sequence (2h)
- [ ] **[P1]** `adapter-sdk/tests/unit/test_fdm.py`: quote, start with `FDM_SIM_SPEED_FACTOR=100` (fast), human pause triggered at 50%, resume CONTINUE, resume ADJUST with nozzle override, abort (2h)

## AI Execution Prompt

```
You are a Python engineer building the OpenA2M Adapter SDK — a standalone pip package that lets hardware vendors implement AIMP domain adapters without touching the gateway core.

TASK: Implement the AIMPAdapter base class, JobContext interface, MockJobContext for testing, compliance test harness, Print2D simulator adapter, and FDM simulator adapter with mid-build human pause.

STACK:
- Python 3.12 + dataclasses / Pydantic v2 for types
- adapter-sdk/ is a standalone pip package — no gateway imports allowed
- pytest + asyncio; adapters are async; use FDM_SIM_SPEED_FACTOR env var to speed up tests
- jsonschema Draft 2020-12 for domain schema validation

CRITICAL RULES:
- AIMPAdapter and JobContext interfaces are FROZEN at end W5 — design for stability; no breaking changes after that
- Adapters MUST NOT import from gateway.app — only from aimp_sdk
- A minimal adapter MUST fit in ≤ 300 LOC (PRD G3); verify Print2D meets this
- FDM sim MUST call ctx.request_human_pause("mid_build_50_percent") at progress == 0.50 if that waypoint is in audit_requirements
- All ctx.emit_* calls must be recorded by MockJobContext for assertion
- **INTERFACE LOCK:** export adapter-sdk/aimp_sdk/base.py to a versioned snapshot after Group 02

Complete Groups 01–06 in order. Run `cd adapter-sdk && pytest -x` after each group. Report before proceeding.
```

## Expected Outputs
- `adapter-sdk/aimp_sdk/__init__.py`
- `adapter-sdk/aimp_sdk/base.py` ← **INTERFACE LOCK**
- `adapter-sdk/aimp_sdk/types.py`
- `adapter-sdk/aimp_sdk/mock_context.py`
- `adapter-sdk/aimp_sdk/utils.py`
- `adapter-sdk/tests/compliance/test_adapter_lifecycle.py`
- `gateway/app/adapters/print2d_sim/` (complete)
- `gateway/app/adapters/fdm_sim/` (complete)

## Verification Checklist
- [ ] `cd adapter-sdk && pytest -x` — all tests green
- [ ] Compliance harness passes for both Print2D and FDM adapters
- [ ] `print2d_sim` LOC ≤ 300 (excluding schema.json)
- [ ] FDM sim triggers `request_human_pause` at progress == 0.50 in test with pause_for_human_at set
- [ ] `base.py` interface has no imports from `gateway.app`
- [ ] `make lint-gateway` — FDM and Print2D adapters lint clean

## Notes
- `FDM_SIM_SPEED_FACTOR=100` should make a 73-minute job complete in ~44 seconds for tests
- The FDM sim's sensor data (`extruder_temp` oscillating around nozzle_temp_celsius ± 2°C) makes the console sensor charts meaningful to look at
- Vision check stubs are intentionally simple — production vision models are out of scope (PRD NG3)
