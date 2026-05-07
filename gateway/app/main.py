"""OpenA2M Gateway — FastAPI application entry point."""
from contextlib import asynccontextmanager
import asyncio
import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from app.core.config import settings
from app.core.database import engine, Base
from app.core.redis_client import redis_client
from app.core.audit import AuditLog
from app.core.tracing import RequestIdMiddleware, setup_tracing
from app.core.rate_limiter import RateLimiterMiddleware
from app.routers import discover, quote, execute, telemetry, abort, resume, jobs, devices, domains, policies, budgets, webhooks, audit as audit_router, metrics as metrics_router, users as users_router, signing_keys as signing_keys_router, auth as auth_router, tools as tools_router
from app.services.adapter_registry import adapter_registry
from app.services.budget_service import BudgetService
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
    # Budget period reset loop
    asyncio.create_task(_budget_reset_loop())
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

# Rate limiter
app.add_middleware(RateLimiterMiddleware)

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
app.include_router(tools_router.router, prefix="/v1", tags=["Integration"])


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


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Wrap any plain-string HTTPException detail into the AIMP spec error envelope."""
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        # Already wrapped by aimp_error()
        content = {"error": detail}
    else:
        # Legacy raise or third-party raise — wrap it
        content = {
            "error": {
                "code": "ERR_UNKNOWN",
                "message": str(detail) if detail else "An error occurred.",
                "category": "internal",
                "retryable": False,
                "details": {},
            }
        }
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "ERR_INTERNAL",
                "message": "An unexpected error occurred.",
                "category": "internal",
                "retryable": False,
                "details": {},
            }
        },
    )


async def _budget_reset_loop() -> None:
    """Hourly background task: reset expired budget windows."""
    while True:
        await asyncio.sleep(3600)
        try:
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                await BudgetService.reset_expired_windows(db)
                await db.commit()
        except Exception as exc:
            logger.warning("Budget reset loop error: %s", exc)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8080)),
        reload=os.getenv("AIMP_DEV", "false").lower() == "true",
        log_level="info",
    )
