"""AIMP §05 — Cryptographic append-only audit log with ed25519 signing."""
from __future__ import annotations
import base64
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from app.core.config import settings

logger = logging.getLogger("aimp.audit")

_private_key: Optional[Ed25519PrivateKey] = None
_public_key: Optional[Ed25519PublicKey] = None
_last_hash: str = "0" * 64  # genesis hash


def _load_or_generate_key() -> Ed25519PrivateKey:
    key_path = Path(settings.AIMP_AUDIT_PRIVATE_KEY_PATH)
    if key_path.exists():
        pem = key_path.read_bytes()
        return serialization.load_pem_private_key(pem, password=None)
    else:
        key_path.parent.mkdir(parents=True, exist_ok=True)
        key = Ed25519PrivateKey.generate()
        pem = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        key_path.write_bytes(pem)
        logger.info("Generated new audit signing key at %s", key_path)
        return key


class AuditLog:
    """Singleton audit log manager."""

    @classmethod
    async def init(cls) -> None:
        global _private_key, _public_key
        try:
            _private_key = _load_or_generate_key()
            _public_key = _private_key.public_key()
            logger.info("Audit signing key loaded.")
        except Exception as exc:
            logger.warning("Audit key init failed (%s); signatures disabled.", exc)

    @classmethod
    def sign_entry(cls, entry_data: dict) -> tuple[str, str]:
        """
        Returns (entry_hash, signature_b64).
        entry_hash is sha256(prev_hash + canonical_json).
        """
        global _last_hash
        canonical = json.dumps(entry_data, sort_keys=True, separators=(",", ":"))
        content = _last_hash + canonical
        entry_hash = hashlib.sha256(content.encode()).hexdigest()
        _last_hash = entry_hash

        if _private_key is None:
            return entry_hash, ""

        sig_bytes = _private_key.sign(entry_hash.encode())
        sig_b64 = base64.b64encode(sig_bytes).decode()
        return entry_hash, sig_b64

    @classmethod
    def get_public_key_pem(cls) -> str:
        if _public_key is None:
            return ""
        return _public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

    @classmethod
    def verify_chain(cls, entries: list[dict]) -> list[dict]:
        """Verify hash chain integrity. Returns list of verification results."""
        results = []
        prev_hash = "0" * 64
        pub = _public_key
        for entry in entries:
            entry_hash = entry.get("entry_hash", "")
            sig_b64 = entry.get("signature", "")
            data = {k: v for k, v in entry.items() if k not in ("entry_hash", "signature")}
            canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
            expected_hash = hashlib.sha256((prev_hash + canonical).encode()).hexdigest()
            hash_ok = entry_hash == expected_hash
            sig_ok = False
            if pub and sig_b64:
                try:
                    sig_bytes = base64.b64decode(sig_b64)
                    pub.verify(sig_bytes, entry_hash.encode())
                    sig_ok = True
                except Exception:
                    sig_ok = False
            results.append({
                "entry_id": entry.get("id"),
                "hash_ok": hash_ok,
                "sig_ok": sig_ok,
                "expected_hash": expected_hash,
                "actual_hash": entry_hash,
            })
            prev_hash = entry_hash
        return results
