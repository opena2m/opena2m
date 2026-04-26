#!/usr/bin/env python3
"""
Seed script — pre-loads reference data into a running OpenA2M gateway.
Run: python scripts/seed.py
Or via Makefile: make seed
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'gateway'))

GATEWAY_URL = os.getenv("AIMP_GATEWAY_URL", "http://localhost:8080")
TOKEN = os.getenv("AIMP_DEV_TOKEN", "dev-token")


async def seed():
    import httpx

    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=GATEWAY_URL, headers=headers, timeout=30) as client:

        print("🌱 OpenA2M Seed Script")
        print(f"   Gateway: {GATEWAY_URL}\n")

        # ── Check health ──────────────────────────────────────────────────
        r = await client.get("/health")
        r.raise_for_status()
        print(f"✓ Gateway healthy: {r.json()}")

        # ── Register domains ──────────────────────────────────────────────
        # (Adapters auto-register; domains may need a manual DB entry for discovery)

        # ── Create devices ────────────────────────────────────────────────
        devices = [
            {
                "device_id": "cloudprint-sim-1",
                "display_name": "Cloud Print Simulator",
                "vendor": "OpenA2M",
                "model": "PrintSim-2000",
                "firmware": "1.0.0",
                "risk_tier": "routine",
                "conformance": "L3",
                "domains": ["manufacturing.print.2d.v1"],
                "location": {"site": "datacenter-1", "country": "US"},
                "capabilities": {
                    "device_class": "PRINTER_2D",
                    "audit_channels": ["camera.top", "sensor.ink_level"],
                    "max_page_size": "A3",
                    "color_capable": True,
                },
            },
            {
                "device_id": "fdm-sim-1",
                "display_name": "FDM 3D Printer Simulator",
                "vendor": "OpenA2M",
                "model": "FDMSim-300",
                "firmware": "1.2.0",
                "risk_tier": "restricted",
                "conformance": "L3",
                "domains": ["manufacturing.additive.fdm.v1"],
                "location": {"site": "fablab-1", "country": "US"},
                "capabilities": {
                    "device_class": "PRINTER_3D",
                    "audit_channels": ["camera.top", "sensor.extruder_temp", "sensor.bed_temp", "sensor.chamber_temp"],
                    "build_volume_mm": {"x": 220, "y": 220, "z": 250},
                    "supported_materials": ["PLA_white", "PETG_black", "PETG_white"],
                },
            },
        ]

        for dev in devices:
            r = await client.post("/v1/devices", json=dev)
            if r.status_code == 409:
                print(f"  (already exists) device: {dev['device_id']}")
            elif r.status_code == 201:
                print(f"✓ Created device: {dev['device_id']}")
            else:
                print(f"  Device {dev['device_id']}: {r.status_code} {r.text}")

        # ── Create budgets ────────────────────────────────────────────────
        budgets = [
            {"name": "Alice Agent Monthly", "currency": "USD", "ceiling": 500.0,
             "warn_threshold": 0.8, "period": "monthly"},
            {"name": "FDM Lab Budget", "currency": "USD", "ceiling": 200.0,
             "warn_threshold": 0.75, "period": "monthly"},
        ]
        for b in budgets:
            r = await client.post("/v1/budgets", json=b)
            if r.status_code == 201:
                print(f"✓ Created budget: {b['name']}")
            else:
                print(f"  Budget {b['name']}: {r.status_code} {r.text}")

        # ── Create policies ───────────────────────────────────────────────
        policies = [
            {
                "name": "Allow routine print jobs",
                "description": "Print2D simulator is routine — always allow",
                "priority": 50,
                "rule": {
                    "conditions": {"risk_tier": "routine"},
                    "action": "allow",
                },
            },
            {
                "name": "HITL for restricted FDM",
                "description": "FDM is restricted tier — require human-in-the-loop",
                "priority": 30,
                "rule": {
                    "conditions": {"risk_tier": "restricted"},
                    "action": "require_hitl",
                },
            },
        ]
        for p in policies:
            r = await client.post("/v1/policies", json=p)
            if r.status_code == 201:
                print(f"✓ Created policy: {p['name']}")
            else:
                print(f"  Policy {p['name']}: {r.status_code} {r.text}")

        print("\n✅ Seed complete!")
        print("\nNext steps:")
        print("  open http://localhost:3000")
        print()
        print("  # Run a 2D print job (happy path):")
        print("  curl -X POST http://localhost:8080/v1/quote \\")
        print("    -H 'Authorization: Bearer dev-token' \\")
        print("    -H 'Content-Type: application/json' \\")
        print("    -d '{\"envelope\":{\"aimp_version\":\"1.0\",\"job_id\":\"test-print-01\"},")
        print("         \"device_id\":\"cloudprint-sim-1\",\"domain\":\"manufacturing.print.2d.v1\",")
        print("         \"payload\":{\"pages\":4,\"copies\":1,\"color_mode\":\"color\"}}'")
        print()
        print("  # Run a 3D print job (HITL checkpoint at 50%):")
        print("  See docs/scenarios.md for full FDM walkthrough.")


if __name__ == "__main__":
    asyncio.run(seed())
