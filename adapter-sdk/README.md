# AIMP Adapter SDK

Build custom domain adapters for the OpenA2M gateway in minutes.

## Install

```bash
pip install aimp-adapter-sdk
# or in-tree:
pip install -e ./adapter-sdk
```

## Quick Start

```python
from aimp_sdk import BaseAdapter

class CoffeeMachineAdapter(BaseAdapter):
    domain_id = "appliance.coffee.v1"
    version = "1.0.0"

    async def compute_quote(self, device_id, payload, asset=None, logistics=None):
        beans_g = payload.get("beans_grams", 18)
        return {
            "cost": {
                "currency": "USD",
                "amount": round(beans_g * 0.05, 2),
                "breakdown": {"material": beans_g * 0.05, "machine_time": 0, "logistics": 0, "service_fee": 0}
            },
            "resource_consumption": {
                "material": [{"name": "coffee_beans", "quantity": beans_g, "unit": "g"}],
                "machine_time_seconds": 45,
            }
        }

    async def execute(self, job_id, device_id, audit_requirements=None):
        import asyncio
        await self._set_state(job_id, "EXECUTING", "brewing")
        for i in range(1, 11):
            await asyncio.sleep(0.5)
            await self._set_progress(job_id, i / 10)
            await self._add_sensor(job_id, "water_temp", 92 + i * 0.3, "degC")
        await self._set_state(job_id, "COMPLETED", "brew_done")

    def get_consumables(self, device_id):
        return [{"name": "coffee_beans", "quantity": 250, "unit": "g"}]

def create_adapter():
    return CoffeeMachineAdapter()
```

## Registration

Register your adapter in `setup.py`:

```python
entry_points={
    "aimp.adapters": ["appliance.coffee.v1 = my_package.adapter:create_adapter"],
}
```

## Lifecycle Callbacks

| Method | Description |
|--------|-------------|
| `_set_state(job_id, state, reason)` | Transition job state |
| `_set_progress(job_id, 0.0–1.0)` | Update progress |
| `_add_sensor(job_id, channel, value, unit)` | Emit sensor reading |
| `_add_media(job_id, channel, url, mime)` | Emit media snapshot |
| `_add_vision_check(job_id, name, passed, confidence, detail)` | Emit vision result |

## States

`LOCKED` → `EXECUTING` → [`AUDITING` → `EXECUTING`] → `FULFILLING` → `COMPLETED`

Terminal states (adapter must not call after): `COMPLETED`, `ABORTED`, `FAILED`
