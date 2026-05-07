"""In-memory sliding window rate limiter middleware (L5)."""
from __future__ import annotations
import time
from collections import defaultdict
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# (principal_id, endpoint_path) → list of request timestamps
_windows: dict[tuple[str, str], list[float]] = defaultdict(list)

# Default limits per minute
_DEFAULT_LIMIT = 120
_WINDOW_SECONDS = 60


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Adds X-RateLimit-* headers and raises 429 when limit is exceeded."""

    async def dispatch(self, request: Request, call_next):
        # Only rate-limit authenticated /v1 paths
        if not request.url.path.startswith("/v1"):
            return await call_next(request)

        principal_id = _extract_principal_id(request)
        if principal_id is None:
            return await call_next(request)

        key = (principal_id, request.url.path)
        now = time.monotonic()

        # Sliding window: keep only timestamps within the last window
        window = _windows[key]
        cutoff = now - _WINDOW_SECONDS
        _windows[key] = [t for t in window if t > cutoff]
        window = _windows[key]

        remaining = max(0, _DEFAULT_LIMIT - len(window))
        reset_at = int(time.time()) + _WINDOW_SECONDS

        if len(window) >= _DEFAULT_LIMIT:
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "ERR_RATE_LIMITED",
                        "message": "Rate limit exceeded. Please slow down.",
                        "category": "validation",
                        "retryable": True,
                        "details": {
                            "limit": _DEFAULT_LIMIT,
                            "window_seconds": _WINDOW_SECONDS,
                        },
                    }
                },
                headers={
                    "X-RateLimit-Limit": str(_DEFAULT_LIMIT),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_at),
                },
            )

        _windows[key].append(now)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(_DEFAULT_LIMIT)
        response.headers["X-RateLimit-Remaining"] = str(remaining - 1)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response


def _extract_principal_id(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        # Use token prefix as a lightweight key (avoid full JWT decode in middleware)
        return token[:32]
    return None
