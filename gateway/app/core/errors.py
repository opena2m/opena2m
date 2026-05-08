"""AIMP spec-compliant error helpers (§06)."""
from __future__ import annotations
from typing import Any, Optional

from fastapi import HTTPException


def aimp_error(
    code: str,
    message: str,
    category: str,
    retryable: bool = False,
    status: int = 400,
    details: Optional[dict] = None,
) -> HTTPException:
    """Return an HTTPException whose `detail` is the spec error envelope."""
    return HTTPException(
        status_code=status,
        detail={
            "code": code,
            "message": message,
            "category": category,
            "retryable": retryable,
            "details": details or {},
        },
    )


# ─── Convenience factories ─────────────────────────────────────────────────────

def err_unauthenticated(msg: str = "Authorization header required.") -> HTTPException:
    return aimp_error("ERR_UNAUTHENTICATED", msg, "auth", retryable=False, status=401)


def err_token_expired(msg: str = "Token expired.") -> HTTPException:
    return aimp_error("ERR_TOKEN_EXPIRED", msg, "auth", retryable=False, status=401)


def err_token_invalid(msg: str = "Invalid token.") -> HTTPException:
    return aimp_error("ERR_TOKEN_INVALID", msg, "auth", retryable=False, status=401)


def err_forbidden_scope(scope: str) -> HTTPException:
    return aimp_error(
        "ERR_FORBIDDEN_SCOPE",
        f"Insufficient scope: required '{scope}'",
        "auth",
        retryable=False,
        status=403,
    )


def err_forbidden_domain(domain_id: str) -> HTTPException:
    return aimp_error(
        "ERR_FORBIDDEN_DOMAIN",
        f"Access denied for domain '{domain_id}'",
        "auth",
        retryable=False,
        status=403,
    )


def err_forbidden_device(device_id: str) -> HTTPException:
    return aimp_error(
        "ERR_FORBIDDEN_DEVICE",
        f"Access denied for device '{device_id}'",
        "auth",
        retryable=False,
        status=403,
    )


def err_approval_required(msg: str = "Approval token required.") -> HTTPException:
    return aimp_error("ERR_APPROVAL_REQUIRED", msg, "policy", retryable=False, status=403)


def err_budget_exceeded(msg: str) -> HTTPException:
    return aimp_error("ERR_BUDGET_EXCEEDED", msg, "policy", retryable=False, status=402)


def err_risk_tier_blocked(reason: str = "") -> HTTPException:
    return aimp_error(
        "ERR_RISK_TIER_BLOCKED",
        f"Policy denied: {reason}" if reason else "Risk tier blocked by policy.",
        "policy",
        retryable=False,
        status=403,
    )


def err_job_not_found(job_id: str) -> HTTPException:
    return aimp_error("ERR_JOB_NOT_FOUND", f"Job '{job_id}' not found.", "resource", status=404)


def err_device_not_found(device_id: str) -> HTTPException:
    return aimp_error("ERR_DEVICE_NOT_FOUND", f"Device '{device_id}' not found.", "resource", status=404)


def err_quote_unknown(quote_id: str) -> HTTPException:
    return aimp_error("ERR_QUOTE_UNKNOWN", f"Quote '{quote_id}' not found.", "resource", status=404)


def err_quote_expired() -> HTTPException:
    return aimp_error("ERR_QUOTE_EXPIRED", "Quote has expired.", "resource", retryable=True, status=409)


def err_invalid_state_transition(from_state: str, to_state: str) -> HTTPException:
    return aimp_error(
        "ERR_INVALID_STATE_TRANSITION",
        f"Cannot transition from {from_state} to {to_state}.",
        "validation",
        retryable=False,
        status=409,
    )


def err_invalid_payload(msg: str, path: Optional[list] = None) -> HTTPException:
    details = {"path": path} if path else {}
    return aimp_error("ERR_INVALID_PAYLOAD", msg, "validation", retryable=False, status=422, details=details)


def err_invalid_envelope(msg: str) -> HTTPException:
    return aimp_error("ERR_INVALID_ENVELOPE", msg, "validation", retryable=False, status=422)


def err_version_unsupported(version: str) -> HTTPException:
    return aimp_error(
        "ERR_VERSION_UNSUPPORTED",
        f"Unsupported AIMP version: {version}. This gateway supports 1.0.",
        "validation",
        retryable=False,
        status=400,
    )


def err_unsafe_parameter(msg: str) -> HTTPException:
    return aimp_error("ERR_UNSAFE_PARAMETER", msg, "safety", retryable=False, status=422)


def err_asset_hash_mismatch() -> HTTPException:
    return aimp_error(
        "ERR_ASSET_HASH_MISMATCH",
        "Asset hash does not match declared hash.",
        "asset",
        retryable=False,
        status=422,
    )


def err_asset_unreachable(url: str) -> HTTPException:
    return aimp_error(
        "ERR_ASSET_UNREACHABLE",
        f"Asset URL is not reachable: {url}",
        "asset",
        retryable=True,
        status=422,
    )
