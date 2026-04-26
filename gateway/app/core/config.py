"""Configuration — all values from environment variables (12-factor)."""
from __future__ import annotations
import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    AIMP_DB_URL: str = "sqlite+aiosqlite:///./opena2m.db"
    AIMP_DB_POOL_SIZE: int = 10

    # Redis
    AIMP_REDIS_URL: str = "redis://localhost:6379/0"

    # Object store
    AIMP_OBJECT_STORE_ENDPOINT: str = "http://localhost:9000"
    AIMP_OBJECT_STORE_BUCKET: str = "aimp-media"
    AIMP_OBJECT_STORE_ACCESS_KEY: str = "minioadmin"
    AIMP_OBJECT_STORE_SECRET_KEY: str = "minioadmin"
    AIMP_MEDIA_URL_EXPIRY_SECONDS: int = 86400

    # Auth
    AIMP_JWT_SECRET: str = "dev-insecure-secret-change-me"
    AIMP_JWT_ALGORITHM: str = "HS256"
    AIMP_TOKEN_EXPIRE_MINUTES: int = 60
    AIMP_DEV_TOKEN: str = "dev-token"

    # OIDC (optional)
    AIMP_OIDC_ISSUER: str = ""
    AIMP_OIDC_CLIENT_ID: str = ""
    AIMP_OIDC_CLIENT_SECRET: str = ""

    # Audit signing
    AIMP_AUDIT_PRIVATE_KEY_PATH: str = "./keys/audit_ed25519.pem"

    # Gateway
    AIMP_BASE_URL: str = "http://localhost:8080"
    AIMP_DEV: str = "true"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Webhook
    AIMP_WEBHOOK_RETRY_MAX: int = 8
    AIMP_WEBHOOK_RETRY_BASE_SECONDS: float = 5.0
    AIMP_WEBHOOK_DLQ_RETAIN_HOURS: int = 24

    # Quote
    AIMP_QUOTE_TTL_SECONDS: int = 3600

    # Rate limits
    AIMP_RATE_LIMIT_DISCOVER_PER_MINUTE: int = 120
    AIMP_RATE_LIMIT_QUOTE_PER_MINUTE: int = 30
    AIMP_RATE_LIMIT_EXECUTE_PER_MINUTE: int = 10

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
