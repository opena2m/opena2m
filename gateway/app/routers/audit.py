"""GET /v1/audit — append-only audit log with chain verification and export."""
import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.models.orm import AuditEntry

router = APIRouter()


@router.get("/audit")
async def list_audit(
    job_id: Optional[str] = None,
    event_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:audit:read")
    q = select(AuditEntry).order_by(desc(AuditEntry.id))
    if job_id:
        q = q.where(AuditEntry.job_id == job_id)
    if event_type:
        q = q.where(AuditEntry.event_type == event_type)
    q = q.offset((page - 1) * page_size).limit(page_size)
    entries = (await db.execute(q)).scalars().all()
    return {
        "entries": [
            {
                "id": e.id,
                "job_id": e.job_id,
                "event_type": e.event_type,
                "principal_id": e.principal_id,
                "payload": e.payload_json,
                "entry_hash": e.entry_hash,
                "signature": e.signature,
                "at": e.at.isoformat() if e.at else None,
            }
            for e in entries
        ],
        "page": page,
        "page_size": page_size,
    }


@router.get("/audit/verify")
async def verify_audit_chain(
    job_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:audit:read")
    q = select(AuditEntry).order_by(AuditEntry.id)
    if job_id:
        q = q.where(AuditEntry.job_id == job_id)
    entries = (await db.execute(q)).scalars().all()
    raw = [
        {
            "id": e.id,
            "job_id": e.job_id,
            "event_type": e.event_type,
            "principal_id": e.principal_id,
            "payload": e.payload_json,
            "entry_hash": e.entry_hash,
            "signature": e.signature,
        }
        for e in entries
    ]
    results = AuditLog.verify_chain(raw)
    all_ok = all(r["hash_ok"] and (r["sig_ok"] or not e.get("signature")) for r, e in zip(results, raw))
    return {
        "chain_valid": all_ok,
        "public_key_pem": AuditLog.get_public_key_pem(),
        "entry_count": len(results),
        "results": results,
    }


@router.post("/audit/export")
async def export_audit_bundle(
    job_id: Optional[str] = None,
    since: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    """
    Export the audit log as a signed ZIP bundle.

    The bundle contains:
      - ``audit.jsonl``  — one JSON entry per line, oldest first
      - ``manifest.json`` — entry count, hash of first/last entries,
                            gateway public key PEM, export timestamp

    The bundle can be verified offline with:
      python -m gateway.app.cli.audit_verify <bundle.zip>
    """
    principal.require("aimp:audit:read")

    q = select(AuditEntry).order_by(AuditEntry.id)
    if job_id:
        q = q.where(AuditEntry.job_id == job_id)
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            q = q.where(AuditEntry.at >= since_dt)
        except ValueError:
            pass
    entries = (await db.execute(q)).scalars().all()

    # Build JSONL content
    lines = []
    for e in entries:
        lines.append(json.dumps({
            "id": e.id,
            "job_id": e.job_id,
            "event_type": e.event_type,
            "principal_id": e.principal_id,
            "payload": e.payload_json,
            "entry_hash": e.entry_hash,
            "signature": e.signature,
            "at": e.at.isoformat() if e.at else None,
        }, default=str))
    jsonl_bytes = "\n".join(lines).encode("utf-8")

    # Build manifest
    manifest = {
        "export_at": datetime.now(timezone.utc).isoformat(),
        "entry_count": len(entries),
        "first_entry_id": entries[0].id if entries else None,
        "last_entry_id": entries[-1].id if entries else None,
        "first_entry_hash": entries[0].entry_hash if entries else None,
        "last_entry_hash": entries[-1].entry_hash if entries else None,
        "gateway_public_key_pem": AuditLog.get_public_key_pem(),
        "job_id_filter": job_id,
        "since_filter": since,
    }
    manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")

    # Pack into ZIP
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("audit.jsonl", jsonl_bytes)
        zf.writestr("manifest.json", manifest_bytes)
    buf.seek(0)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"aimp-audit-{timestamp}.zip"

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Audit-Entry-Count": str(len(entries)),
        },
    )
