"""Shared pytest fixtures for OpenA2M gateway tests."""
import os
import asyncio
import pytest

# Point at SQLite in-memory for tests
os.environ.setdefault("AIMP_DB_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("AIMP_REDIS_URL", "redis://localhost:6379/99")  # unlikely to exist → graceful fail
os.environ.setdefault("AIMP_JWT_SECRET", "test-secret-for-unit-tests")
os.environ.setdefault("AIMP_DEV", "true")
os.environ.setdefault("AIMP_DEV_TOKEN", "dev-token")
os.environ.setdefault("AIMP_AUDIT_PRIVATE_KEY_PATH", "/tmp/test_audit_ed25519.pem")


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped event loop so async fixtures can share state."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def db_engine():
    """Create all tables once per test session."""
    from app.core.database import engine, Base
    from app.models import orm  # noqa: F401 — import models to register with metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db(db_engine):
    """Per-test DB session with automatic rollback."""
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def client(db_engine):
    """AsyncClient wrapping the full FastAPI app for integration tests."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": "Bearer dev-token"},
    ) as c:
        yield c
