"""OpenA2M Gateway — FastAPI application entry point."""
from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from app.core.config import settings
from app.core.database import engine, Base
from app.core.redis_client import redis_client
from app.core.audit import AuditLog
from app.core.tracing import RequestIdMiddleware, setup_tracing
from app.routers import discover, quote, execute, telemetry, abort, resume, jobs, devices, domains, policies, budgets, webhooks, audit as audit_router, metrics as metrics_router, users as users_router, signing_keys as signing_keys_router, auth as auth_router
from app.services.adapter_registry import adapter_registry
from app.services.webhook_dispatcher import WebhookDispatcher

logger = logging.getLogger("aimp.gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("OpenA2M Gateway starting up…")
    # Create tables (dev mode; prod uses Alembic)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Connect Redis
    await redis_client.connect()
    # Discover and load adapter plugins
    await adapter_registry.load_all()
    # Audit log key setup
    await AuditLog.init()
    # Start webhook dispatcher background task
    app.state.webhook_dispatcher = WebhookDispatcher()
    await app.state.webhook_dispatcher.start()
    logger.info("Gateway ready.")
    yield
    # Shutdown
    await app.state.webhook_dispatcher.stop()
    await redis_client.disconnect()
    logger.info("Gateway shut down.")


app = FastAPI(
    title="OpenA2M Gateway",
    description="AIMP 1.0.0-draft reference gateway — AI-to-Machine Protocol",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Tracing & request ID
app.add_middleware(RequestIdMiddleware)
setup_tracing(app)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(discover.router, prefix="/v1", tags=["Core"])
app.include_router(quote.router, prefix="/v1", tags=["Core"])
app.include_router(execute.router, prefix="/v1", tags=["Core"])
app.include_router(telemetry.router, prefix="/v1", tags=["Core"])
app.include_router(abort.router, prefix="/v1", tags=["Core"])
app.include_router(resume.router, prefix="/v1", tags=["Core"])
app.include_router(jobs.router, prefix="/v1", tags=["Jobs"])
app.include_router(devices.router, prefix="/v1", tags=["Devices"])
app.include_router(domains.router, prefix="/v1", tags=["Domains"])
app.include_router(policies.router, prefix="/v1", tags=["Policies"])
app.include_router(budgets.router, prefix="/v1", tags=["Budgets"])
app.include_router(webhooks.router, prefix="/v1", tags=["Webhooks"])
app.include_router(audit_router.router, prefix="/v1", tags=["Audit"])
app.include_router(metrics_router.router, tags=["Observability"])
app.include_router(users_router.router, prefix="/v1", tags=["Users"])
app.include_router(signing_keys_router.router, prefix="/v1", tags=["Keys"])
app.include_router(auth_router.router, prefix="/v1", tags=["Auth"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0", "spec": "AIMP 1.0.0-draft"}


@app.get("/capabilities")
async def capabilities():
    """AIMP §01.6 — gateway capability advertisement."""
    return {
        "aimp_version": "1.0",
        "conformance_level": "L3",
        "domains": adapter_registry.list_domains(),
        "features": [
            "discover", "quote", "execute", "telemetry", "abort", "resume",
            "webhooks", "sse", "audit_log", "hitl", "budget_enforcement",
            "vision_checks", "signed_audit",
        ],
    }


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "message": "An unexpected error occurred."},
    )


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8080)),
        reload=os.getenv("AIMP_DEV", "false").lower() == "true",
        log_level="info",
    )
