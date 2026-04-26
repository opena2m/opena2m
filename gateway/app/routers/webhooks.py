"""GET/POST /v1/webhooks — webhook endpoint management."""
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.models.orm import WebhookEndpoint
from app.models.schemas import WebhookCreate, WebhookResponse

router = APIRouter()


@router.get("/webhooks")
async def list_webhooks(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:webhooks:read")
    endpoints = (await db.execute(select(WebhookEndpoint))).scalars().all()
    return [
        WebhookResponse(
            endpoint_id=ep.endpoint_id,
            url=ep.url,
            events=ep.events,
            enabled=ep.enabled,
        ) for ep in endpoints
    ]


@router.post("/webhooks", status_code=201)
async def create_webhook(
    body: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:webhooks:write")
    secret = body.hmac_secret or secrets.token_hex(32)
    ep = WebhookEndpoint(
        url=body.url,
        hmac_secret=secret,
        events=body.events,
        principal_id=principal.principal_id,
    )
    db.add(ep)
    await db.flush()
    return {
        "endpoint_id": ep.endpoint_id,
        "url": ep.url,
        "hmac_secret": secret,
        "events": ep.events,
    }


@router.delete("/webhooks/{endpoint_id}")
async def delete_webhook(
    endpoint_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    principal.require("aimp:webhooks:write")
    ep = await db.get(WebhookEndpoint, endpoint_id)
    if ep is None:
        raise HTTPException(status_code=404, detail="Webhook not found.")
    await db.delete(ep)
    return {"deleted": True}
