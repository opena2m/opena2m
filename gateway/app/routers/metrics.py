"""
Prometheus metrics — AIMP §14 observability.
Exposes /metrics endpoint with AIMP-specific gauges and histograms.
"""
from __future__ import annotations
import time
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

try:
    from prometheus_client import (
        Counter, Gauge, Histogram, CollectorRegistry,
        generate_latest, CONTENT_TYPE_LATEST,
        REGISTRY,
    )
    _PROMETHEUS_AVAILABLE = True
except ImportError:
    _PROMETHEUS_AVAILABLE = False

router = APIRouter()

if _PROMETHEUS_AVAILABLE:
    # ── HTTP request metrics ───────────────────────────────────────────────
    HTTP_REQUEST_DURATION = Histogram(
        "aimp_http_request_duration_seconds",
        "HTTP request duration in seconds",
        labelnames=["route", "method", "status"],
        buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    )

    # ── Job state gauges ───────────────────────────────────────────────────
    JOBS_IN_STATE = Gauge(
        "aimp_jobs_in_state",
        "Number of jobs currently in each state",
        labelnames=["state"],
    )

    # ── Webhook metrics ────────────────────────────────────────────────────
    WEBHOOK_DELIVERY_DURATION = Histogram(
        "aimp_webhook_delivery_duration_seconds",
        "Webhook delivery round-trip time",
        buckets=[0.1, 0.5, 1, 2, 5, 10, 30],
    )
    WEBHOOK_DLQ_SIZE = Gauge(
        "aimp_webhook_dlq_size",
        "Number of webhook deliveries in DLQ",
    )

    # ── Budget metrics ─────────────────────────────────────────────────────
    BUDGET_CONSUMED = Gauge(
        "aimp_budget_consumed_amount",
        "Budget consumed amount",
        labelnames=["budget_id", "currency"],
    )

    # ── Adapter poll metrics ───────────────────────────────────────────────
    ADAPTER_POLL_DURATION = Histogram(
        "aimp_adapter_poll_duration_seconds",
        "Time spent in adapter execution callbacks",
        labelnames=["domain"],
    )


async def _collect_job_metrics() -> None:
    """Update JOBS_IN_STATE gauge from DB."""
    if not _PROMETHEUS_AVAILABLE:
        return
    try:
        from sqlalchemy import select, func, text
        from app.core.database import AsyncSessionLocal
        from app.models.orm import Job
        from app.core.state_machine import JobState

        async with AsyncSessionLocal() as db:
            rows = (
                await db.execute(
                    select(Job.state, func.count(Job.job_id).label("cnt"))
                    .group_by(Job.state)
                )
            ).all()
            counts = {r[0]: r[1] for r in rows}
            for state in JobState:
                JOBS_IN_STATE.labels(state=state.value).set(counts.get(state.value, 0))
    except Exception:
        pass


async def _collect_webhook_metrics() -> None:
    """Update WEBHOOK_DLQ_SIZE gauge from DB."""
    if not _PROMETHEUS_AVAILABLE:
        return
    try:
        from sqlalchemy import select, func
        from app.core.database import AsyncSessionLocal
        from app.models.orm import WebhookDelivery

        async with AsyncSessionLocal() as db:
            dlq_count = (
                await db.execute(
                    select(func.count()).where(WebhookDelivery.status == "dlq")
                )
            ).scalar() or 0
            WEBHOOK_DLQ_SIZE.set(dlq_count)
    except Exception:
        pass


async def _collect_budget_metrics() -> None:
    """Update BUDGET_CONSUMED gauge from DB."""
    if not _PROMETHEUS_AVAILABLE:
        return
    try:
        from sqlalchemy import select
        from app.core.database import AsyncSessionLocal
        from app.models.orm import Budget

        async with AsyncSessionLocal() as db:
            budgets = (await db.execute(select(Budget))).scalars().all()
            for b in budgets:
                BUDGET_CONSUMED.labels(budget_id=b.budget_id, currency=b.currency).set(b.consumed)
    except Exception:
        pass


@router.get("/metrics", response_class=PlainTextResponse, include_in_schema=False)
async def metrics():
    """Prometheus scrape endpoint."""
    if not _PROMETHEUS_AVAILABLE:
        return PlainTextResponse("# prometheus_client not installed\n", media_type="text/plain")

    await _collect_job_metrics()
    await _collect_webhook_metrics()
    await _collect_budget_metrics()

    return PlainTextResponse(
        generate_latest(REGISTRY).decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )
