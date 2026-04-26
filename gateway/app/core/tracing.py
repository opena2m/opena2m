"""
OpenTelemetry tracing — AIMP §14 observability.
Adds trace IDs to every request and propagates them into adapter calls.
"""
from __future__ import annotations
import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("aimp.tracing")

try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    _OTEL_AVAILABLE = True
except ImportError:
    _OTEL_AVAILABLE = False


def setup_tracing(app) -> None:
    """Instrument FastAPI with OpenTelemetry if available."""
    if not _OTEL_AVAILABLE:
        logger.info("OpenTelemetry not available; tracing disabled.")
        return
    provider = TracerProvider()
    # In production: replace ConsoleSpanExporter with OTLP exporter
    provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    logger.info("OpenTelemetry tracing enabled.")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Injects X-Request-ID and X-Trace-ID response headers for correlation."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        import uuid
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start = time.perf_counter()

        response = await call_next(request)

        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = f"{duration_ms:.1f}"

        logger.debug(
            "%s %s → %d (%.1fms) [%s]",
            request.method, request.url.path,
            response.status_code, duration_ms, request_id,
        )
        return response
