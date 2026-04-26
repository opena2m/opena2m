"""POST /v1/discover — AIMP §01.6.1 capability handshake."""
import logging
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.models.orm import Device, DeviceDomain
from app.models.schemas import (
    DeviceFilter, DeviceInfo, DiscoverRequest, DiscoverResponse, ConsumableInfo
)
from app.services.adapter_registry import adapter_registry

router = APIRouter()
logger = logging.getLogger("aimp.discover")


@router.post("/discover", response_model=DiscoverResponse)
async def discover(
    body: DiscoverRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:discover")
    filt = body.device_filter or DeviceFilter()

    # Query devices
    q = select(Device).where(Device.disabled_at.is_(None))
    if filt.device_ids:
        q = q.where(Device.device_id.in_(filt.device_ids))

    devices = (await db.execute(q)).scalars().all()

    device_infos = []
    for dev in devices:
        # Get associated domains
        dds = (
            await db.execute(
                select(DeviceDomain).where(DeviceDomain.device_id == dev.device_id)
            )
        ).scalars().all()
        domain_ids = [dd.domain_id for dd in dds]

        # Apply domain filter
        if filt.domains:
            matched = False
            for d in domain_ids:
                for pattern in filt.domains:
                    if pattern.endswith("*"):
                        if d.startswith(pattern[:-1]):
                            matched = True
                            break
                    elif d == pattern:
                        matched = True
                        break
            if not matched:
                continue

        # Determine device state from status_json
        status = dev.status_json or {}
        state = "BUSY" if status.get("busy") else "IDLE"

        # Consumables from adapter
        consumables = []
        for domain_id in domain_ids:
            adapter = adapter_registry.get(domain_id)
            if adapter:
                for c in adapter.get_consumables(dev.device_id):
                    consumables.append(ConsumableInfo(**c))

        # Audit channels from capabilities
        caps = dev.capabilities_json or {}
        audit_channels = caps.get("audit_channels", [])

        device_infos.append(DeviceInfo(
            device_id=dev.device_id,
            display_name=dev.display_name,
            device_class=caps.get("device_class"),
            domains=domain_ids,
            state=state,
            risk_tier=dev.risk_tier,
            conformance=dev.conformance,
            consumables=consumables,
            capabilities=caps,
            audit_channels=audit_channels,
            location=dev.location_json,
        ))

    return DiscoverResponse(
        job_id=body.envelope.job_id,
        devices=device_infos,
    )
