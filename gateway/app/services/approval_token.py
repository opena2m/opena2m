"""Approval token service — mint and verify single-use HITL tokens."""
from __future__ import annotations
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("aimp.approval_token")

# In-memory store for dev; prod would use Redis/DB
_used_tokens: set[str] = set()

TOKEN_TTL_SECONDS = 3600  # 1 hour


def mint_token(job_id: str, reviewer_id: str, checkpoint: str) -> str:
    """Create a signed, single-use approval token."""
    nonce = secrets.token_hex(16)
    issued_at = int(time.time())
    payload = {
        "job_id": job_id,
        "reviewer_id": reviewer_id,
        "checkpoint": checkpoint,
        "nonce": nonce,
        "iat": issued_at,
        "exp": issued_at + TOKEN_TTL_SECONDS,
    }
    canonical = json.dumps(payload, sort_keys=True)
    sig = hmac.new(
        settings.AIMP_JWT_SECRET.encode(),
        canonical.encode(),
        hashlib.sha256,
    ).hexdigest()
    # Encode as token_<b64(payload)>.<sig>
    import base64
    encoded = base64.urlsafe_b64encode(canonical.encode()).decode()
    return f"{encoded}.{sig}"


def verify_token(token: str, expected_job_id: str) -> tuple[bool, str]:
    """
    Returns (valid, reason).
    Checks signature, expiry, job_id binding, and single-use.
    """
    import base64
    try:
        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            return False, "malformed token"
        encoded, sig = parts
        canonical = base64.urlsafe_b64decode(encoded.encode()).decode()
        expected_sig = hmac.new(
            settings.AIMP_JWT_SECRET.encode(),
            canonical.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return False, "invalid signature"
        payload = json.loads(canonical)
        if int(time.time()) > payload.get("exp", 0):
            return False, "token expired"
        if payload.get("job_id") != expected_job_id:
            return False, f"token bound to job {payload.get('job_id')}, not {expected_job_id}"
        token_id = payload.get("nonce", token[:32])
        if token_id in _used_tokens:
            return False, "token already used"
        _used_tokens.add(token_id)
        return True, "ok"
    except Exception as exc:
        return False, f"verification error: {exc}"
