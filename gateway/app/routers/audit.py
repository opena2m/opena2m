"""GET /v1/audit — append-only audit log with chain verification."""
from typing import Optional
from fastapi import APIRouter, Depends, Query
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
