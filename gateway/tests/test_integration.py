"""
Integration tests — full API round-trips via ASGI (no network required).
Requires the `client` fixture from conftest.py.
"""
import pytest
import time


@pytest.mark.asyncio
class TestDiscoverEndpoint:
    async def test_discover_returns_200(self, client):
        r = await client.post("/v1/discover", json={
            "envelope": {"aimp_version": "1.0", "job_id": f"test-disc-{int(time.time())}"},
        })
        assert r.status_code == 200
        body = r.json()
        assert "devices" in body
        assert body["aimp_version"] == "1.0"

    async def test_discover_domain_filter(self, client):
        r = await client.post("/v1/discover", json={
            "envelope": {"aimp_version": "1.0", "job_id": f"test-disc-filt-{int(time.time())}"},
            "device_filter": {"domains": ["manufacturing.print.2d.v1"]},
        })
        assert r.status_code == 200

    async def test_discover_requires_auth(self):
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post("/v1/discover", json={
                "envelope": {"aimp_version": "1.0", "job_id": "unauth-test"},
            })
        assert r.status_code == 401


@pytest.mark.asyncio
class TestHealthEndpoint:
    async def test_health_ok(self, client):
        r = await client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    async def test_capabilities(self, client):
        r = await client.get("/capabilities")
        assert r.status_code == 200
        body = r.json()
        assert body["conformance_level"] == "L3"
        assert "discover" in body["features"]


@pytest.mark.asyncio
class TestDevicesEndpoint:
    async def test_list_devices_empty(self, client):
        r = await client.get("/v1/devices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_create_device(self, client):
        r = await client.post("/v1/devices", json={
            "device_id": f"test-device-{int(time.time())}",
            "display_name": "Test Printer",
            "risk_tier": "routine",
            "conformance": "L1",
            "domains": [],
        })
        assert r.status_code == 201
        assert r.json()["created"] is True

    async def test_get_nonexistent_device(self, client):
        r = await client.get("/v1/devices/nonexistent-device-xyz")
        assert r.status_code == 404


@pytest.mark.asyncio
class TestAuditEndpoint:
    async def test_list_audit(self, client):
        r = await client.get("/v1/audit")
        assert r.status_code == 200
        assert "entries" in r.json()

    async def test_verify_chain_empty(self, client):
        r = await client.get("/v1/audit/verify")
        assert r.status_code == 200
        body = r.json()
        assert "chain_valid" in body
        assert "entry_count" in body


@pytest.mark.asyncio
class TestJobsEndpoint:
    async def test_list_jobs_empty(self, client):
        r = await client.get("/v1/jobs")
        assert r.status_code == 200
        body = r.json()
        assert "jobs" in body
        assert "total" in body

    async def test_get_nonexistent_job(self, client):
        r = await client.get("/v1/jobs/NONEXISTENT00000000000000")
        assert r.status_code == 404

    async def test_telemetry_nonexistent_job(self, client):
        r = await client.get("/v1/jobs/NONEXISTENT00000000000000/telemetry")
        assert r.status_code == 404


@pytest.mark.asyncio
class TestPoliciesEndpoint:
    async def test_list_policies(self, client):
        r = await client.get("/v1/policies")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_policy_dry_run(self, client):
        r = await client.post("/v1/policies/dry-run", json={
            "domain": "manufacturing.print.2d.v1",
            "device_id": "cloudprint-sim-1",
            "risk_tier": "routine",
            "principal_kind": "agent",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["action"] in ("allow", "deny", "require_hitl", "require_approval")

    async def test_dry_run_hazardous_requires_approval(self, client):
        """Per AIMP §04 H5: hazardous tier triggers require_approval, not deny."""
        r = await client.post("/v1/policies/dry-run", json={
            "domain": "chemistry.reactor.v1",
            "device_id": "reactor-1",
            "risk_tier": "hazardous",
            "principal_kind": "agent",
        })
        assert r.status_code == 200
        assert r.json()["action"] == "require_approval"


@pytest.mark.asyncio
class TestBudgetsEndpoint:
    async def test_list_budgets(self, client):
        r = await client.get("/v1/budgets")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_create_budget(self, client):
        r = await client.post("/v1/budgets", json={
            "name": "Test Budget",
            "currency": "USD",
            "ceiling": 100.0,
            "warn_threshold": 0.8,
        })
        assert r.status_code == 201
        assert "budget_id" in r.json()


@pytest.mark.asyncio
class TestWebhooksEndpoint:
    async def test_list_webhooks(self, client):
        r = await client.get("/v1/webhooks")
        assert r.status_code == 200

    async def test_create_and_delete_webhook(self, client):
        r = await client.post("/v1/webhooks", json={
            "url": "https://example.com/hook",
            "events": ["state_transition"],
        })
        assert r.status_code == 201
        ep_id = r.json()["endpoint_id"]

        r = await client.delete(f"/v1/webhooks/{ep_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] is True
