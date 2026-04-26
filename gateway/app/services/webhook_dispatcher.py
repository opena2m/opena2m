"""Webhook dispatcher — HMAC-signed delivery with exponential backoff and DLQ."""
from __future__ import annotations
import asyncio
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.orm import WebhookDelivery, WebhookEndpoint

logger = logging.getLogger("aimp.webhook")

BACKOFF_BASE = settings.AIMP_WEBHOOK_RETRY_BASE_SECONDS
MAX_ATTEMPTS = settings.AIMP_WEBHOOK_RETRY_MAX


def _sign_payload(secret: str, body: bytes) -> str:
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


class WebhookDispatcher:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def enqueue(
        self,
        db,
        job_id: Optional[str],
        event_type: str,
        payload: dict,
    ) -> None:
        """Queue a delivery for all matching subscribed endpoints."""
        endpoints = (
            await db.execute(
                select(WebhookEndpoint).where(WebhookEndpoint.enabled == True)
            )
        ).scalars().all()
        for ep in endpoints:
            if event_type not in ep.events and "*" not in ep.events:
                continue
            delivery = WebhookDelivery(
                endpoint_id=ep.endpoint_id,
                job_id=job_id,
                event_type=event_type,
                payload_json=payload,
                status="pending",
                next_retry_at=datetime.now(timezone.utc),
            )
            db.add(delivery)
        await db.flush()

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._process_pending()
            except Exception as exc:
                logger.warning("Webhook dispatcher error: %s", exc)
            await asyncio.sleep(5)

    async def _process_pending(self) -> None:
        async with AsyncSessionLocal() as db:
            now = datetime.now(timezone.utc)
            deliveries = (
                await db.execute(
                    select(WebhookDelivery)
                    .where(
                        WebhookDelivery.status == "pending",
                        WebhookDelivery.next_retry_at <= now,
                    )
                    .limit(20)
                )
            ).scalars().all()

            for delivery in deliveries:
                ep = await db.get(WebhookEndpoint, delivery.endpoint_id)
                if ep is None:
                    delivery.status = "failed"
                    continue
                await self._deliver(db, delivery, ep)
            await db.commit()

    async def _deliver(
        self,
        db,
        delivery: WebhookDelivery,
        ep: WebhookEndpoint,
    ) -> None:
        body = json.dumps(delivery.payload_json, default=str).encode()
        signature = _sign_payload(ep.hmac_secret, body)
        headers = {
            "Content-Type": "application/json",
            "X-AIMP-Signature": signature,
            "X-AIMP-Event": delivery.event_type,
            "X-AIMP-Delivery": str(delivery.id),
        }
        delivery.attempt += 1
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(ep.url, content=body, headers=headers)
                delivery.response_code = resp.status_code
                if resp.status_code < 300:
                    delivery.status = "sent"
                    delivery.sent_at = datetime.now(timezone.utc)
                    logger.info("Webhook delivered to %s (attempt %d)", ep.url, delivery.attempt)
                else:
                    raise ValueError(f"HTTP {resp.status_code}")
        except Exception as exc:
            delivery.error_message = str(exc)
            logger.warning("Webhook delivery failed (attempt %d): %s", delivery.attempt, exc)
            if delivery.attempt >= MAX_ATTEMPTS:
                delivery.status = "dlq"
                logger.error("Webhook moved to DLQ after %d attempts: %s", MAX_ATTEMPTS, ep.url)
            else:
                backoff = BACKOFF_BASE * (2 ** (delivery.attempt - 1))
                delivery.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=backoff)
