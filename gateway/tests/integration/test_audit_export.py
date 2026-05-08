"""
GW-003 — Audit export integration tests.

Verifies:
  - POST /v1/audit/export returns a valid ZIP bundle
  - Bundle contains audit.jsonl + manifest.json
  - audit.jsonl entries are valid JSON with required fields
  - manifest.json contains entry_count, gateway_public_key_pem, etc.
  - The exported chain can be verified by audit_verify.verify_chain()
  - GET /v1/audit/verify reports chain_valid=True for freshly written entries
  - Export respects job_id and since filters
"""
from __future__ import annotations
import io
import json
import zipfile
from datetime import datetime, timezone

import pytest


pytestmark = pytest.mark.asyncio


# ── Fixtures ──────────────────────────────────────────────────────────────────

async def _seed_audit_entry(client, job_id: str, event_type: str = "test.event") -> dict:
    """
    Trigger a gateway operation that writes an audit entry.
    We use the discover endpoint as it's the lightest operation.
    """
    r = await client.post(
        "/v1/discover",
        json={
            "envelope": {"aimp_version": "1.0", "job_id": job_id},
            "device_filter": {},
        },
    )
    # 200 or 200-ish; we don't care about the response — we just need the audit entry
    return {"job_id": job_id, "status": r.status_code}


# ── Export endpoint ───────────────────────────────────────────────────────────

class TestAuditExportEndpoint:
    async def test_export_returns_200(self, client):
        r = await client.post("/v1/audit/export")
        assert r.status_code == 200

    async def test_export_content_type_zip(self, client):
        r = await client.post("/v1/audit/export")
        assert "zip" in r.headers.get("content-type", "").lower()

    async def test_export_content_disposition(self, client):
        r = await client.post("/v1/audit/export")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".zip" in cd

    async def test_export_bundle_is_valid_zip(self, client):
        r = await client.post("/v1/audit/export")
        buf = io.BytesIO(r.content)
        assert zipfile.is_zipfile(buf)

    async def test_export_bundle_contains_required_files(self, client):
        r = await client.post("/v1/audit/export")
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            names = zf.namelist()
        assert "audit.jsonl" in names
        assert "manifest.json" in names

    async def test_export_manifest_has_required_fields(self, client):
        r = await client.post("/v1/audit/export")
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        required = {"export_at", "entry_count", "gateway_public_key_pem"}
        for field in required:
            assert field in manifest, f"manifest missing field: {field}"

    async def test_export_manifest_entry_count_is_integer(self, client):
        r = await client.post("/v1/audit/export")
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        assert isinstance(manifest["entry_count"], int)
        assert manifest["entry_count"] >= 0

    async def test_export_header_entry_count_matches_manifest(self, client):
        r = await client.post("/v1/audit/export")
        header_count = int(r.headers.get("x-audit-entry-count", -1))
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        assert header_count == manifest["entry_count"]


# ── JSONL content ─────────────────────────────────────────────────────────────

class TestAuditExportJsonl:
    async def test_jsonl_lines_are_valid_json(self, client):
        r = await client.post("/v1/audit/export")
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            raw = zf.read("audit.jsonl").decode()
        for i, line in enumerate(raw.splitlines()):
            if not line.strip():
                continue
            try:
                json.loads(line)
            except json.JSONDecodeError as exc:
                pytest.fail(f"Line {i+1} is not valid JSON: {exc}\n  {line[:200]}")

    async def test_jsonl_entries_have_required_fields(self, client):
        r = await client.post("/v1/audit/export")
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            raw = zf.read("audit.jsonl").decode()
        entries = [json.loads(l) for l in raw.splitlines() if l.strip()]
        if not entries:
            pytest.skip("No audit entries yet — run seed first")
        required = {"id", "job_id", "event_type", "entry_hash"}
        for e in entries:
            for field in required:
                assert field in e, f"Entry {e.get('id')} missing field: {field}"

    async def test_jsonl_entries_ordered_oldest_first(self, client):
        r = await client.post("/v1/audit/export")
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            raw = zf.read("audit.jsonl").decode()
        entries = [json.loads(l) for l in raw.splitlines() if l.strip()]
        if len(entries) < 2:
            pytest.skip("Need at least 2 entries to check ordering")
        ids = [e["id"] for e in entries]
        assert ids == sorted(ids), "Entries are not ordered by id (oldest first)"


# ── Chain verification ────────────────────────────────────────────────────────

class TestAuditChainVerification:
    async def test_verify_endpoint_returns_chain_valid(self, client):
        r = await client.get("/v1/audit/verify")
        assert r.status_code == 200
        data = r.json()
        assert "chain_valid" in data
        # If there are entries, chain must be valid (we haven't tampered with it)
        if data.get("entry_count", 0) > 0:
            assert data["chain_valid"] is True, (
                f"Audit chain invalid! Results: {data.get('results', [])[:3]}"
            )

    async def test_verify_endpoint_returns_public_key(self, client):
        r = await client.get("/v1/audit/verify")
        assert r.status_code == 200
        data = r.json()
        assert "public_key_pem" in data
        # May be None if signing key not configured — that's allowed
        if data["public_key_pem"]:
            assert "PUBLIC KEY" in data["public_key_pem"]

    async def test_exported_bundle_passes_offline_verify(self, client):
        """
        Round-trip test: export bundle → run audit_verify.verify_chain() on it.
        This tests the full chain: gateway writes → export → offline verifier.
        """
        r = await client.post("/v1/audit/export")
        assert r.status_code == 200

        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            manifest = json.loads(zf.read("manifest.json"))
            raw_jsonl = zf.read("audit.jsonl").decode()

        entries = [json.loads(l) for l in raw_jsonl.splitlines() if l.strip()]

        if not entries:
            pytest.skip("No audit entries to verify")

        # Import the offline verifier
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app", "cli"))
        from app.cli.audit_verify import verify_chain

        chain_valid, results = verify_chain(entries, verbose=False)
        failed = [r for r in results if not r["hash_ok"]]
        assert chain_valid, (
            f"Exported audit chain failed offline verification. "
            f"Failed entries: {[f['id'] for f in failed]}"
        )


# ── Filter tests ──────────────────────────────────────────────────────────────

class TestAuditExportFilters:
    async def test_export_with_nonexistent_job_id_returns_empty_bundle(self, client):
        r = await client.post("/v1/audit/export?job_id=nonexistent-job-xyz-999")
        assert r.status_code == 200
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        assert manifest["entry_count"] == 0
        assert manifest["job_id_filter"] == "nonexistent-job-xyz-999"

    async def test_export_since_filter_works(self, client):
        """since= filter must not return entries before that timestamp."""
        future = "2099-01-01T00:00:00Z"
        r = await client.post(f"/v1/audit/export?since={future}")
        assert r.status_code == 200
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        assert manifest["entry_count"] == 0

    async def test_export_past_since_returns_entries(self, client):
        """since= in the far past should return all entries."""
        past = "2000-01-01T00:00:00Z"
        r = await client.post(f"/v1/audit/export?since={past}")
        assert r.status_code == 200
        r_all = await client.post("/v1/audit/export")
        buf_f = io.BytesIO(r.content)
        buf_a = io.BytesIO(r_all.content)
        with zipfile.ZipFile(buf_f) as zf:
            count_filtered = json.loads(zf.read("manifest.json"))["entry_count"]
        with zipfile.ZipFile(buf_a) as zf:
            count_all = json.loads(zf.read("manifest.json"))["entry_count"]
        # since=far-past should return same count as unfiltered
        assert count_filtered == count_all


# ── Auth ──────────────────────────────────────────────────────────────────────

class TestAuditAuth:
    async def test_export_requires_auth(self):
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            # No Authorization header
        ) as anon_client:
            r = await anon_client.post("/v1/audit/export")
        assert r.status_code == 401

    async def test_verify_requires_auth(self):
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as anon_client:
            r = await anon_client.get("/v1/audit/verify")
        assert r.status_code == 401
