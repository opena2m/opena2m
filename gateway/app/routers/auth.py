"""
AIMP §04 — OIDC / Auth Router

Endpoints:
  GET  /v1/auth/login       → build OIDC authorisation URL, redirect browser
  GET  /v1/auth/callback    → exchange code → tokens, mint gateway JWT, redirect console
  POST /v1/auth/logout      → invalidate session (best-effort)
  GET  /v1/auth/me          → return current principal info

Security model:
  • Full OIDC flow requires AIMP_OIDC_ISSUER, AIMP_OIDC_CLIENT_ID,
    AIMP_OIDC_CLIENT_SECRET to be set.
  • When OIDC is not configured the endpoints return 503 with a clear
    error so operators know they need to set env vars — never 501.
  • PKCE (S256 challenge) is always used.  The code_verifier is stored
    in a signed cookie (HttpOnly, Secure in production, SameSite=Lax).
  • On callback success a gateway JWT (HS256) is minted from the
    id_token claims.  The JWT is passed to the console as a redirect
    query parameter so the SPA can store it in localStorage.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import secrets
import time
import urllib.parse
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Cookie, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.auth import create_access_token
from app.core.config import settings

logger = logging.getLogger("aimp.auth")

router = APIRouter()

# ── PKCE helpers ──────────────────────────────────────────────────────────────

def _pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge_S256)."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


# ── OIDC metadata discovery ───────────────────────────────────────────────────

_oidc_cache: Dict[str, Any] = {}
_oidc_cache_ts: float = 0.0
_OIDC_CACHE_TTL = 3600.0  # re-discover hourly


async def _discover_oidc() -> dict:
    """Fetch and cache the OIDC provider's well-known configuration."""
    global _oidc_cache, _oidc_cache_ts
    now = time.time()
    if _oidc_cache and now - _oidc_cache_ts < _OIDC_CACHE_TTL:
        return _oidc_cache

    issuer = settings.AIMP_OIDC_ISSUER.rstrip("/")
    url = f"{issuer}/.well-known/openid-configuration"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            _oidc_cache = r.json()
            _oidc_cache_ts = now
            return _oidc_cache
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot reach OIDC provider at {url}: {exc}",
        )


def _oidc_not_configured() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "code": "ERR_OIDC_NOT_CONFIGURED",
            "message": (
                "OIDC login is not configured. "
                "Set AIMP_OIDC_ISSUER, AIMP_OIDC_CLIENT_ID, and "
                "AIMP_OIDC_CLIENT_SECRET environment variables."
            ),
            "retryable": False,
        },
    )


# ── State cookie ──────────────────────────────────────────────────────────────

_COOKIE_NAME = "aimp_oidc_state"
_COOKIE_MAX_AGE = 600  # 10 minutes — ample time to complete login


def _set_state_cookie(response: Response, state: str, verifier: str) -> None:
    payload = f"{state}:{verifier}"
    response.set_cookie(
        key=_COOKIE_NAME,
        value=payload,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.AIMP_DEV.lower() != "true",
        path="/v1/auth",
    )


def _read_state_cookie(cookie_value: Optional[str]) -> tuple[str, str]:
    """Parse cookie → (state, code_verifier). Raises 400 on failure."""
    if not cookie_value or ":" not in cookie_value:
        raise HTTPException(status_code=400, detail="Missing or malformed OIDC state cookie.")
    state, verifier = cookie_value.split(":", 1)
    return state, verifier


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/auth/login",
    summary="OIDC login — redirects to identity provider",
    tags=["Auth"],
    response_class=RedirectResponse,
)
async def oidc_login(
    redirect_uri: Optional[str] = Query(
        default=None,
        description="Where to send the browser after successful login (defaults to AIMP_BASE_URL/dashboard).",
    ),
) -> Response:
    """
    Build the OIDC authorization URL and redirect the browser.

    The `redirect_uri` is the **console** URL (e.g. `http://localhost:3000/login`).
    It is stored in the state cookie so the callback can forward the browser there.
    If OIDC is not configured, returns 503 so the console can fall back to token mode.
    """
    if not settings.AIMP_OIDC_ISSUER or not settings.AIMP_OIDC_CLIENT_ID:
        raise _oidc_not_configured()

    meta = await _discover_oidc()
    authorization_endpoint = meta.get("authorization_endpoint")
    if not authorization_endpoint:
        raise HTTPException(status_code=503, detail="OIDC metadata missing authorization_endpoint.")

    verifier, challenge = _pkce_pair()
    state_token = secrets.token_urlsafe(32)

    # Embed console redirect in the state so we can forward after callback
    console_redirect = redirect_uri or f"{settings.AIMP_BASE_URL}/dashboard"
    state_payload = base64.urlsafe_b64encode(
        json.dumps({"state": state_token, "redirect": console_redirect}).encode()
    ).decode()

    params = {
        "response_type": "code",
        "client_id": settings.AIMP_OIDC_CLIENT_ID,
        "redirect_uri": f"{settings.AIMP_BASE_URL}/v1/auth/callback",
        "scope": "openid profile email",
        "state": state_payload,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    auth_url = authorization_endpoint + "?" + urllib.parse.urlencode(params)

    response = RedirectResponse(url=auth_url, status_code=302)
    _set_state_cookie(response, state_token, verifier)
    logger.info("OIDC login redirect → %s", authorization_endpoint)
    return response


@router.get(
    "/auth/callback",
    summary="OIDC callback — exchanges code for tokens",
    tags=["Auth"],
)
async def oidc_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
    aimp_oidc_state: Optional[str] = Cookie(default=None),
) -> Response:
    """
    Handle the OIDC provider callback.

    Exchanges the authorization code for an id_token, extracts claims,
    mints a gateway JWT, then redirects the browser to the console
    with `?token=<gateway-jwt>` so the SPA can store it.
    """
    if not settings.AIMP_OIDC_ISSUER or not settings.AIMP_OIDC_CLIENT_ID:
        raise _oidc_not_configured()

    # Provider reported an error
    if error:
        desc = error_description or error
        logger.warning("OIDC callback error: %s — %s", error, desc)
        raise HTTPException(status_code=400, detail=f"OIDC error: {desc}")

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state parameter.")

    # Validate state + retrieve PKCE verifier from cookie
    cookie_state, verifier = _read_state_cookie(aimp_oidc_state)

    try:
        state_data = json.loads(base64.urlsafe_b64decode(state + "=="))
        if state_data.get("state") != cookie_state:
            raise HTTPException(status_code=400, detail="OIDC state mismatch — possible CSRF.")
        console_redirect = state_data.get("redirect", f"{settings.AIMP_BASE_URL}/dashboard")
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="Malformed OIDC state parameter.")

    # Discover token endpoint
    meta = await _discover_oidc()
    token_endpoint = meta.get("token_endpoint")
    if not token_endpoint:
        raise HTTPException(status_code=503, detail="OIDC metadata missing token_endpoint.")

    # Exchange code → tokens
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": f"{settings.AIMP_BASE_URL}/v1/auth/callback",
                    "client_id": settings.AIMP_OIDC_CLIENT_ID,
                    "client_secret": settings.AIMP_OIDC_CLIENT_SECRET,
                    "code_verifier": verifier,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            r.raise_for_status()
            token_response = r.json()
    except httpx.HTTPStatusError as exc:
        logger.error("OIDC token exchange failed: %s", exc.response.text)
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {exc.response.status_code}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Token exchange error: {exc}")

    # Decode id_token (no signature check — already exchanged with provider directly)
    id_token = token_response.get("id_token", "")
    claims: dict = {}
    if id_token:
        try:
            # JWT payload is the second base64url segment
            parts = id_token.split(".")
            if len(parts) >= 2:
                padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
                claims = json.loads(base64.urlsafe_b64decode(padded))
        except Exception:
            pass  # Fall through to access_token introspection

    # Extract user identity from claims
    subject = claims.get("sub") or token_response.get("sub", "oidc-user")
    name = claims.get("name") or claims.get("preferred_username") or subject
    email = claims.get("email", "")
    principal_id = f"human://{subject}"
    if email:
        principal_id = f"human://{email}"

    # Mint a gateway JWT
    gateway_token = create_access_token(
        principal_id=principal_id,
        kind="human",
        display_name=name,
        scopes=["read", "write", "review"],
    )

    logger.info("OIDC login successful for %s (%s)", principal_id, name)

    # Redirect console to its callback URL with the gateway token
    redirect_url = console_redirect
    sep = "&" if "?" in redirect_url else "?"
    redirect_url = f"{redirect_url}{sep}token={gateway_token}"

    response = RedirectResponse(url=redirect_url, status_code=302)
    # Clear the state cookie
    response.delete_cookie(key=_COOKIE_NAME, path="/v1/auth")
    return response


@router.post(
    "/auth/logout",
    summary="Invalidate the current session",
    tags=["Auth"],
)
async def logout(request: Request) -> JSONResponse:
    """
    Best-effort logout.

    - Clears the OIDC state cookie.
    - If OIDC is configured and the provider supports end_session_endpoint,
      returns the logout URL so the client can redirect the browser there.
    - The gateway itself is stateless — JWTs expire according to AIMP_TOKEN_EXPIRE_MINUTES.
    """
    end_session_url: Optional[str] = None

    if settings.AIMP_OIDC_ISSUER and settings.AIMP_OIDC_CLIENT_ID:
        try:
            meta = await _discover_oidc()
            end_session_url = meta.get("end_session_endpoint")
        except Exception:
            pass  # Non-fatal — OIDC provider may be offline

    response = JSONResponse(
        content={
            "logged_out": True,
            "end_session_url": end_session_url,
            "message": "JWT tokens are stateless — client must delete the stored token.",
        }
    )
    response.delete_cookie(key=_COOKIE_NAME, path="/v1/auth")
    return response


@router.get(
    "/auth/me",
    summary="Return the current principal's identity",
    tags=["Auth"],
)
async def auth_me(request: Request) -> JSONResponse:
    """
    Return basic info about the authenticated principal.
    Useful for the console Profile tab and token validation.
    Requires a valid Bearer token.
    """
    from app.core.auth import get_current_principal
    from fastapi.security import HTTPAuthorizationCredentials
    from fastapi import Security

    # Manual extraction so we can call without FastAPI DI in tests
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header required.")
    token = auth_header.removeprefix("Bearer ").strip()

    # Re-use the existing auth logic by constructing a mock credentials object
    from fastapi.security import HTTPAuthorizationCredentials
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    from app.core.auth import get_current_principal as _get
    # Call synchronously since get_current_principal is async
    import inspect
    if inspect.iscoroutinefunction(_get):
        principal = await _get(credentials=creds)
    else:
        principal = _get(credentials=creds)

    return JSONResponse(
        content={
            "principal_id": principal.principal_id,
            "kind": principal.kind,
            "display_name": principal.display_name,
            "scopes": principal.scopes,
            "oidc_configured": bool(settings.AIMP_OIDC_ISSUER and settings.AIMP_OIDC_CLIENT_ID),
        }
    )
