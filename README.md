# OpenA2M

> Reference implementation of the **AIMP (AI-to-Machine Protocol)** — gateway,
> operator console, adapter SDK, and two reference scenarios, batteries-included.

**Version:** 0.1.0 · **Spec targeted:** AIMP 1.0.0-draft · **Conformance target:** L3

---

## Quick Start

```bash
# 1. Start the full stack
make dev-up          # docker compose: gateway + postgres + redis + minio + console

# 2. Register reference devices
make seed

# 3. Open the operator console
open http://localhost:3000

# 4. Run a 2D print job (happy path)
make discover        # see available devices

# Full scenario walkthrough
python scripts/test_journey_a.py   # 2D print: discover→quote→execute→completed
python scripts/test_journey_b.py   # FDM: discover→quote→execute→HITL→resume→completed
```

## Architecture

```
              ┌────────────────────────┐
              │   AI Agent (MCP / TS)  │
              └──────────┬─────────────┘
                         │ MCP
                ┌────────▼────────┐
                │   MCP Bridge    │  :8090
                └────────┬────────┘
                         │ HTTPS (AIMP REST)
┌───────────┐   ┌────────▼──────────────────────┐   ┌──────────────┐
│ Console   │◄──┤          Gateway API          ├──►│ Object Store │
│ (React)   │   │ ┌───────────────────────────┐ │   │ (MinIO/S3)   │
│  :3000    │   │ │ State Machine · Policy    │ │   └──────────────┘
└───────────┘   │ │ Budgets · Audit · Hooks   │ │   ┌──────────────┐
                │ └───────────────────────────┘ ├──►│  Postgres    │
                │             ▲                 │   └──────────────┘
                │             │ AdapterSDK      │   ┌──────────────┐
                │     ┌───────┴────────┐        ├──►│   Redis      │
                │     │   Adapters     │        │   └──────────────┘
                │     │  (plugin pkgs) │        │
                └─────┴───────┬────────┴────────┘
                              │
             ┌────────────────┼─────────────────┐
      ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────┐
      │ Print2D Sim │  │  FDM Sim    │  │ Your Adapter │
      │  (routine)  │  │  (HITL)     │  │              │
      └─────────────┘  └─────────────┘  └──────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Gateway | 8080 | AIMP REST API, state machine, adapters |
| Console | 3000 | Operator web UI |
| MCP Bridge | 8090 | MCP server wrapping AIMP verbs |
| PostgreSQL | 5432 | Primary data store |
| Redis | 6379 | Pub/sub, telemetry fan-out |
| MinIO | 9000/9001 | Object store for media |

## Reference Scenarios

| Device | Domain | Risk | Demonstrates |
|--------|--------|------|--------------|
| `cloudprint-sim-1` | `manufacturing.print.2d.v1` | routine | Happy-path, progress, shipping |
| `fdm-sim-1` | `manufacturing.additive.fdm.v1` | restricted | HITL checkpoint at 50%, vision checks |

## AIMP Core Verbs

```bash
# Discover
curl -X POST http://localhost:8080/v1/discover \
  -H 'Authorization: Bearer dev-token' \
  -d '{"envelope":{"aimp_version":"1.0","job_id":"cli-01"}}'

# Quote
curl -X POST http://localhost:8080/v1/quote \
  -H 'Authorization: Bearer dev-token' \
  -d '{"envelope":{"aimp_version":"1.0","job_id":"job-01"},
       "device_id":"cloudprint-sim-1",
       "domain":"manufacturing.print.2d.v1",
       "payload":{"pages":4,"copies":1,"color_mode":"color"}}'

# Execute (use quote_id from quote response)
curl -X POST http://localhost:8080/v1/execute \
  -H 'Authorization: Bearer dev-token' \
  -d '{"envelope":{"aimp_version":"1.0","job_id":"job-01"},"quote_id":"<quote_id>"}'

# Telemetry
curl http://localhost:8080/v1/jobs/job-01/telemetry \
  -H 'Authorization: Bearer dev-token'

# Abort
curl -X POST http://localhost:8080/v1/jobs/job-01/abort \
  -H 'Authorization: Bearer dev-token' \
  -d '{"envelope":{"aimp_version":"1.0","job_id":"job-01"},"reason":"test"}'
```

## Repository Layout

```
opena2m/
├── Makefile                   ← developer workflow
├── gateway/                   ← Python/FastAPI AIMP gateway
│   ├── app/
│   │   ├── main.py            ← FastAPI app entry point
│   │   ├── core/              ← config, db, auth, state machine, audit
│   │   ├── models/            ← SQLAlchemy ORM + Pydantic schemas
│   │   ├── routers/           ← REST endpoints (one file per verb)
│   │   ├── services/          ← job service, policy, budget, webhooks
│   │   └── adapters/          ← built-in adapter plugins
│   ├── migrations/            ← Alembic migrations
│   ├── tests/                 ← pytest unit tests
│   └── requirements.txt
├── console/                   ← React + TypeScript SPA
│   └── src/
│       ├── pages/             ← Dashboard, Jobs, Review, Devices, …
│       ├── components/        ← Layout, shared UI
│       └── lib/               ← API client, utilities
├── adapter-sdk/               ← Standalone SDK for third-party adapters
├── mcp-bridge/                ← MCP server wrapping AIMP REST
├── scripts/                   ← seed.py, test_journey_a.py, test_journey_b.py
└── deploy/
    ├── docker-compose.yml
    └── k8s/deployment.yaml
```

## Writing Your Own Adapter

```python
from aimp_sdk import BaseAdapter
import asyncio

class MyAdapter(BaseAdapter):
    domain_id = "my.domain.v1"
    version = "1.0.0"

    async def compute_quote(self, device_id, payload, asset=None, logistics=None):
        return {
            "cost": {"currency": "USD", "amount": 10.0,
                     "breakdown": {"material": 8.0, "machine_time": 2.0, "logistics": 0, "service_fee": 0}},
            "resource_consumption": {"machine_time_seconds": 300}
        }

    async def execute(self, job_id, device_id, audit_requirements=None):
        await self._set_state(job_id, "EXECUTING", "started")
        for i in range(1, 11):
            await asyncio.sleep(1)
            await self._set_progress(job_id, i / 10)
            await self._add_sensor(job_id, "temperature", 35.0 + i, "degC")
        await self._set_state(job_id, "COMPLETED", "done")

def create_adapter():
    return MyAdapter()
```

## License

Apache-2.0
