#!/usr/bin/env python3
"""
Journey A — Cloud 2D Print happy path integration test.
Tests: discover → quote → execute → telemetry polling → COMPLETED
"""
import asyncio, httpx, time, sys, os

GATEWAY = os.getenv("AIMP_GATEWAY_URL", "http://localhost:8080")
TOKEN   = os.getenv("AIMP_DEV_TOKEN", "dev-token")
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

JOB_ID  = f"test-journey-a-{int(time.time())}"


async def run():
    async with httpx.AsyncClient(base_url=GATEWAY, headers=HEADERS, timeout=60) as c:
        print(f"\n=== Journey A: Cloud 2D Print === job_id={JOB_ID}\n")

        # 1. Discover
        r = await c.post("/v1/discover", json={
            "envelope": {"aimp_version": "1.0", "job_id": JOB_ID},
            "device_filter": {"domains": ["manufacturing.print.2d.v1"]},
        })
        assert r.status_code == 200, f"discover failed: {r.text}"
        devices = r.json()["devices"]
        assert len(devices) > 0, "No print2d devices found — run `make seed` first"
        device_id = devices[0]["device_id"]
        print(f"✓ discover → device: {device_id}")

        # 2. Quote
        r = await c.post("/v1/quote", json={
            "envelope": {"aimp_version": "1.0", "job_id": JOB_ID},
            "device_id": device_id,
            "domain": "manufacturing.print.2d.v1",
            "payload": {"pages": 4, "copies": 1, "color_mode": "color", "paper_size": "A4"},
            "budget_limit": {"amount": 50.0, "currency": "USD"},
        })
        assert r.status_code == 200, f"quote failed: {r.text}"
        quote = r.json()
        assert quote["state"] == "QUOTED"
        assert not quote.get("exceeds_budget")
        quote_id = quote["quote_id"]
        print(f"✓ quote → quote_id={quote_id} cost=${quote['estimated_cost']['amount']:.2f}")

        # 3. Execute
        r = await c.post("/v1/execute", json={
            "envelope": {"aimp_version": "1.0", "job_id": JOB_ID},
            "quote_id": quote_id,
            "audit_requirements": {
                "snapshot_interval_seconds": 5,
                "sensors": ["printer.temperature", "printer.ink_level"],
            },
        })
        assert r.status_code == 202, f"execute failed: {r.text}"
        exec_resp = r.json()
        assert exec_resp["state"] == "LOCKED"
        print(f"✓ execute → state=LOCKED")

        # 4. Poll telemetry until COMPLETED
        max_polls = 30
        for i in range(max_polls):
            await asyncio.sleep(1.5)
            r = await c.get(f"/v1/jobs/{JOB_ID}/telemetry")
            assert r.status_code == 200
            t = r.json()
            state = t["state"]
            progress = t["progress"]
            print(f"  poll {i+1:2d}: state={state:12s} progress={progress:.0%}  sensors={len(t['sensor_readings'])}")
            if state == "COMPLETED":
                print(f"\n✓ Job COMPLETED! Sensors recorded: {len(t['sensor_readings'])}, Media: {len(t['media'])}")
                break
            if state in ("ABORTED", "FAILED"):
                print(f"\n✗ Job terminated unexpectedly: {state}")
                sys.exit(1)
        else:
            print("\n✗ Timed out waiting for COMPLETED")
            sys.exit(1)

        # 5. Verify audit
        r = await c.get("/v1/audit", params={"job_id": JOB_ID})
        entries = r.json()["entries"]
        print(f"✓ Audit log: {len(entries)} entries")

        r = await c.get("/v1/audit/verify", params={"job_id": JOB_ID})
        result = r.json()
        assert result["chain_valid"], f"Audit chain invalid! {result}"
        print(f"✓ Audit chain verified ({result['entry_count']} entries)")

        print("\n=== Journey A PASSED ✅ ===\n")


if __name__ == "__main__":
    asyncio.run(run())
