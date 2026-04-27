"""GET/POST /v1/devices — device management."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.models.orm import Device, DeviceDomain

router = APIRouter()


class DeviceCreate(BaseModel):
    device_id: str
    display_name: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    firmware: Optional[str] = None
    location: Optional[dict] = None
    risk_tier: str = "routine"
    conformance: str = "L1"
    domains: list[str] = []
    capabilities: Optional[dict] = None


@router.get("/devices")
async def list_devices(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:devices:read")
    devices = (await db.execute(select(Device).where(Device.disabled_at.is_(None)))).scalars().all()
    result = []
    for d in devices:
        dds = (await db.execute(select(DeviceDomain).where(DeviceDomain.device_id == d.device_id))).scalars().all()
        result.append({
            "device_id": d.device_id,
            "display_name": d.display_name,
            "vendor": d.vendor,
            "model": d.model,
            "firmware": d.firmware,
            "risk_tier": d.risk_tier,
            "conformance": d.conformance,
            "domains": [dd.domain_id for dd in dds],
            "status": d.status_json,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        })
    return result


@router.get("/devices/{device_id}")
async def get_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:devices:read")
    device = await db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    dds = (await db.execute(select(DeviceDomain).where(DeviceDomain.device_id == device_id))).scalars().all()
    return {
        "device_id": device.device_id,
        "display_name": device.display_name,
        "vendor": device.vendor,
        "model": device.model,
        "firmware": device.firmware,
        "risk_tier": device.risk_tier,
        "conformance": device.conformance,
        "domains": [dd.domain_id for dd in dds],
        "location": device.location_json,
        "status": device.status_json,
        "capabilities": device.capabilities_json,
        "created_at": device.created_at.isoformat() if device.created_at else None,
    }


@router.post("/devices", status_code=201)
async def create_device(
    body: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:devices:write")
    existing = await db.get(Device, body.device_id)
    if existing:
        raise HTTPException(status_code=409, detail="Device already exists.")
    device = Device(
        device_id=body.device_id,
        display_name=body.display_name,
        vendor=body.vendor,
        model=body.model,
        firmware=body.firmware,
        location_json=body.location,
        risk_tier=body.risk_tier,
        conformance=body.conformance,
        status_json={"reachable": True, "busy": False},
        capabilities_json=body.capabilities,
    )
    db.add(device)
    for domain_id in body.domains:
        db.add(DeviceDomain(device_id=body.device_id, domain_id=domain_id))
    await db.flush()
    return {"device_id": device.device_id, "created": True}


@router.delete("/devices/{device_id}", status_code=200)
async def disable_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:devices:write")
    from datetime import datetime, timezone
    device = await db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    device.disabled_at = datetime.now(timezone.utc)
    return {"device_id": device_id, "disabled": True}


@router.post("/devices/{device_id}/restart")
async def restart_device_adapter(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    """Restart the adapter for a device. Logged to audit trail."""
    principal.require("aimp:devices:write")
    from app.models.orm import Device as DeviceModel
    device = await db.get(DeviceModel, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")
    from app.core.audit import AuditLog
    from app.services.adapter_registry import AdapterRegistry
    registry = AdapterRegistry()
    await registry.reload_adapter(device_id)
    await AuditLog.write(
        db=db, event_type="device.restart",
        payload={"device_id": device_id, "requested_by": principal.principal_id},
        principal_id=principal.principal_id, job_id=None,
    )
    return {"device_id": device_id, "restarting": True}


@router.post("/devices/{device_id}/toggle")
async def toggle_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    """Enable or disable a device adapter. Logged to audit trail."""
    principal.require("aimp:devices:write")
    from sqlalchemy import select
    from app.models.orm import Device as DeviceModel
    from datetime import datetime, timezone
    device = await db.get(DeviceModel, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")
    now_disabled = device.disabled_at is not None
    device.disabled_at = None if now_disabled else datetime.now(timezone.utc)
    await db.commit()
    from app.core.audit import AuditLog
    await AuditLog.write(
        db=db, event_type="device.toggle",
        payload={"device_id": device_id, "now_enabled": now_disabled},
        principal_id=principal.principal_id, job_id=None,
    )
    return {"device_id": device_id, "now_enabled": now_disabled}
