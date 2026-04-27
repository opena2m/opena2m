"""GET /v1/signing-keys — audit signing key metadata for Settings → Keys tab."""
from fastapi import APIRouter, Depends

from app.core.audit import AuditLog, _private_key
from app.core.auth import Principal, get_current_principal

router = APIRouter()


@router.get("/signing-keys")
async def list_signing_keys(
    principal: Principal = Depends(get_current_principal),
):
    """Returns audit signing key fingerprints (public info only — no private key material)."""
    principal.require("aimp:audit:read")
    pem = AuditLog.get_public_key_pem()
    keys = []
    if pem:
        import hashlib, base64
        # Compute fingerprint of public key
        raw_lines = [l for l in pem.splitlines() if l and not l.startswith('---')]
        raw_bytes = base64.b64decode(''.join(raw_lines))
        fp = base64.b64encode(hashlib.sha256(raw_bytes).digest()).decode()
        keys.append({
            "key_id": "KEY001",
            "fingerprint": f"SHA256:{fp}",
            "status": "active",
            "purpose": "audit_signing",
            "created_at": "2025-04-01T00:00:00Z",
        })
    else:
        keys.append({
            "key_id": "KEY001",
            "fingerprint": "SHA256:(key not loaded — check AIMP_AUDIT_PRIVATE_KEY_PATH)",
            "status": "inactive",
            "purpose": "audit_signing",
            "created_at": None,
        })
    return keys
