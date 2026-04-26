"""GET /v1/domains — domain/adapter management."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.models.orm import Domain
from app.services.adapter_registry import adapter_registry

router = APIRouter()


@router.get("/domains")
async def list_domains(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:domains:read")
    domains = (await db.execute(select(Domain))).scalars().all()
    result = []
    for d in domains:
        adapter = adapter_registry.get(d.domain_id)
        result.append({
            "domain_id": d.domain_id,
            "schema_uri": d.schema_uri,
            "adapter_package": d.adapter_package,
            "adapter_version": d.adapter_version,
            "loaded": adapter is not None,
            "registered_at": d.registered_at.isoformat() if d.registered_at else None,
        })
    return result


@router.get("/domains/{domain_id}")
async def get_domain(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:domains:read")
    domain = await db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="Domain not found.")
    return {
        "domain_id": domain.domain_id,
        "schema_uri": domain.schema_uri,
        "schema": domain.schema_json,
        "adapter_package": domain.adapter_package,
        "adapter_version": domain.adapter_version,
        "registered_at": domain.registered_at.isoformat() if domain.registered_at else None,
    }
