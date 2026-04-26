"""Authentication & authorization middleware for OpenA2M Gateway."""
from __future__ import annotations
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

logger = logging.getLogger("aimp.auth")

bearer_scheme = HTTPBearer(auto_error=False)


class Principal:
    def __init__(
        self,
        principal_id: str,
        kind: str,  # agent | human | system
        display_name: str,
        scopes: list[str],
        token_id: Optional[str] = None,
    ) -> None:
        self.principal_id = principal_id
        self.kind = kind
        self.display_name = display_name
        self.scopes = scopes
        self.token_id = token_id

    def can(self, scope: str) -> bool:
        return "*" in self.scopes or scope in self.scopes

    def require(self, scope: str) -> None:
        if not self.can(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient scope: required '{scope}'",
            )


DEV_PRINCIPAL = Principal(
    principal_id="system://dev",
    kind="system",
    display_name="Dev Token",
    scopes=["*"],
    token_id="dev",
)


async def get_current_principal(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
) -> Principal:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authorization header required.")

    token = credentials.credentials

    # Dev shortcut
    if token == settings.AIMP_DEV_TOKEN and settings.AIMP_DEV.lower() == "true":
        return DEV_PRINCIPAL

    # JWT decode
    try:
        payload = jwt.decode(
            token,
            settings.AIMP_JWT_SECRET,
            algorithms=[settings.AIMP_JWT_ALGORITHM],
        )
        return Principal(
            principal_id=payload.get("sub", ""),
            kind=payload.get("kind", "agent"),
            display_name=payload.get("name", payload.get("sub", "")),
            scopes=payload.get("scopes", []),
            token_id=payload.get("jti"),
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


def create_access_token(
    principal_id: str,
    kind: str,
    display_name: str,
    scopes: list[str],
    expires_minutes: int = None,
) -> str:
    """Mint a JWT for a principal."""
    import time
    expires_minutes = expires_minutes or settings.AIMP_TOKEN_EXPIRE_MINUTES
    payload = {
        "sub": principal_id,
        "kind": kind,
        "name": display_name,
        "scopes": scopes,
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_minutes * 60,
    }
    return jwt.encode(payload, settings.AIMP_JWT_SECRET, algorithm=settings.AIMP_JWT_ALGORITHM)
