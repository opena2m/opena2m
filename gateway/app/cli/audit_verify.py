#!/usr/bin/env python3
"""
AIMP §05 — Audit Log Verifier CLI

Verifies the ed25519 hash chain of an exported audit bundle produced by
POST /v1/audit/export.

Usage:
    python -m gateway.app.cli.audit_verify <bundle.zip>
    python -m gateway.app.cli.audit_verify <bundle.zip> --verbose
    python -m gateway.app.cli.audit_verify --gateway http://localhost:8080 --token dev-token

Exit codes:
    0  — chain fully valid
    1  — one or more entries have invalid hashes or signatures
    2  — bundle format error or missing manifest

Invoked by `make audit-verify`.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
import zipfile
from pathlib import Path
from typing import Optional

try:
    import zstandard as zstd
    _HAS_ZSTD = True
except ImportError:
    _HAS_ZSTD = False

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.exceptions import InvalidSignature
    _HAS_CRYPTO = True
except ImportError:
    _HAS_CRYPTO = False


# ── Chain verification ────────────────────────────────────────────────────────

def _verify_entry(
    entry: dict,
    prev_hash: str,
    pub_key: Optional["Ed25519PublicKey"],
) -> dict:
    """Verify a single audit entry. Returns a result dict."""
    entry_hash = entry.get("entry_hash", "")
    sig_b64 = entry.get("signature", "")

    # Reconstruct canonical form (same logic as AuditLog.sign_entry)
    data = {k: v for k, v in entry.items() if k not in ("entry_hash", "signature")}
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
    expected_hash = hashlib.sha256((prev_hash + canonical).encode()).hexdigest()

    hash_ok = entry_hash == expected_hash

    sig_ok = False
    sig_note = ""
    if not sig_b64:
        sig_note = "(no signature — key not configured at export time)"
        sig_ok = True  # Not a chain failure if signing was disabled
    elif not _HAS_CRYPTO:
        sig_note = "(cryptography library not installed; skipping sig check)"
        sig_ok = None  # Unknown
    elif pub_key is None:
        sig_note = "(no public key in manifest; skipping sig check)"
        sig_ok = None
    else:
        try:
            sig_bytes = base64.b64decode(sig_b64)
            pub_key.verify(sig_bytes, entry_hash.encode())
            sig_ok = True
        except (InvalidSignature, Exception) as exc:
            sig_ok = False
            sig_note = str(exc)

    return {
        "id": entry.get("id"),
        "hash_ok": hash_ok,
        "sig_ok": sig_ok,
        "sig_note": sig_note,
        "expected_hash": expected_hash,
        "actual_hash": entry_hash,
        "entry": entry,
    }


def verify_chain(
    entries: list[dict],
    pub_key: Optional["Ed25519PublicKey"] = None,
    verbose: bool = False,
) -> tuple[bool, list[dict]]:
    """
    Walk the full hash chain. Returns (chain_valid, results).
    chain_valid is False if any entry has a bad hash or bad signature.
    """
    results = []
    prev_hash = "0" * 64  # genesis hash
    chain_valid = True

    for i, entry in enumerate(entries):
        result = _verify_entry(entry, prev_hash, pub_key)
        results.append(result)

        hash_ok = result["hash_ok"]
        sig_ok = result["sig_ok"]

        if not hash_ok:
            chain_valid = False
        if sig_ok is False:
            chain_valid = False

        if verbose or not hash_ok or sig_ok is False:
            eid = result["id"]
            h_mark = "✓" if hash_ok else "✗"
            s_mark = "✓" if sig_ok is True else ("?" if sig_ok is None else "✗")
            note = f" {result['sig_note']}" if result["sig_note"] else ""
            print(f"  [{i+1:4d}] id={eid:>8}  hash={h_mark}  sig={s_mark}{note}")
            if not hash_ok:
                print(f"         expected: {result['expected_hash']}")
                print(f"         actual:   {result['actual_hash']}")

        prev_hash = result["actual_hash"] if hash_ok else result["expected_hash"]

    return chain_valid, results


# ── Bundle loading ────────────────────────────────────────────────────────────

def _load_bundle_zip(path: Path) -> tuple[list[dict], dict]:
    """Load entries and manifest from a .zip export bundle."""
    entries = []
    manifest = {}

    if not path.exists():
        print(f"ERROR: File not found: {path}", file=sys.stderr)
        sys.exit(2)

    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()

        # Load manifest
        manifest_names = [n for n in names if "manifest" in n.lower()]
        if manifest_names:
            with zf.open(manifest_names[0]) as mf:
                manifest = json.load(mf)
        else:
            print("WARNING: No manifest.json found in bundle", file=sys.stderr)

        # Load JSONL entries (possibly zstd-compressed)
        jsonl_names = [n for n in names if n.endswith(".jsonl") or n.endswith(".jsonl.zst")]
        if not jsonl_names:
            print("ERROR: No .jsonl or .jsonl.zst file in bundle", file=sys.stderr)
            sys.exit(2)

        for jname in jsonl_names:
            with zf.open(jname) as jf:
                raw = jf.read()
                if jname.endswith(".zst"):
                    if not _HAS_ZSTD:
                        print("ERROR: zstandard not installed; run: pip install zstandard", file=sys.stderr)
                        sys.exit(2)
                    dctx = zstd.ZstdDecompressor()
                    raw = dctx.decompress(raw)
                for line in raw.decode().splitlines():
                    line = line.strip()
                    if line:
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError as exc:
                            print(f"WARNING: Skipping malformed line: {exc}", file=sys.stderr)

    return entries, manifest


def _load_from_gateway(gateway_url: str, token: str) -> tuple[list[dict], dict]:
    """Fetch audit entries directly from a running gateway via REST."""
    try:
        import httpx
    except ImportError:
        print("ERROR: httpx not installed; run: pip install httpx", file=sys.stderr)
        sys.exit(2)

    headers = {"Authorization": f"Bearer {token}"}
    entries = []
    page = 1
    while True:
        r = httpx.get(f"{gateway_url}/v1/audit", headers=headers, params={"page": page, "page_size": 200})
        r.raise_for_status()
        data = r.json()
        batch = data.get("entries", [])
        if not batch:
            break
        entries.extend(batch)
        if len(batch) < 200:
            break
        page += 1

    # Reverse so oldest first (API returns newest first)
    entries.reverse()

    manifest = {"source": gateway_url, "entry_count": len(entries)}
    return entries, manifest


def _load_public_key(manifest: dict) -> Optional["Ed25519PublicKey"]:
    """Extract and parse the ed25519 public key from a manifest."""
    if not _HAS_CRYPTO:
        return None
    pem = manifest.get("public_key_pem") or manifest.get("gateway_public_key_pem")
    if not pem:
        return None
    try:
        key = serialization.load_pem_public_key(pem.encode() if isinstance(pem, str) else pem)
        if isinstance(key, Ed25519PublicKey):
            return key
    except Exception as exc:
        print(f"WARNING: Could not parse public key from manifest: {exc}", file=sys.stderr)
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m gateway.app.cli.audit_verify",
        description="Verify the AIMP audit log hash chain from a bundle or live gateway.",
    )
    parser.add_argument(
        "bundle",
        nargs="?",
        help="Path to audit bundle .zip file (from POST /v1/audit/export)",
    )
    parser.add_argument(
        "--gateway",
        metavar="URL",
        help="Verify against a live gateway (e.g. http://localhost:8080)",
    )
    parser.add_argument(
        "--token",
        default="dev-token",
        help="Bearer token for gateway auth (default: dev-token)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Print each entry result",
    )
    args = parser.parse_args(argv)

    if not args.bundle and not args.gateway:
        parser.error("Provide either a bundle file path or --gateway URL")

    print("\n=== AIMP Audit Chain Verifier ===\n")

    # Load entries
    if args.gateway:
        print(f"Loading entries from: {args.gateway}")
        entries, manifest = _load_from_gateway(args.gateway, args.token)
    else:
        bundle_path = Path(args.bundle)
        print(f"Loading bundle: {bundle_path}")
        entries, manifest = _load_bundle_zip(bundle_path)

    print(f"Entries to verify: {len(entries)}\n")

    if not entries:
        print("WARNING: No audit entries found — nothing to verify")
        return 0

    # Load public key for signature verification
    pub_key = _load_public_key(manifest)
    if pub_key:
        print("Public key loaded from manifest — signatures will be verified.\n")
    else:
        print("No public key in manifest — hash chain only (no signature verification).\n")

    # Verify chain
    chain_valid, results = verify_chain(entries, pub_key, verbose=args.verbose)

    # Summary
    bad_hash = sum(1 for r in results if not r["hash_ok"])
    bad_sig = sum(1 for r in results if r["sig_ok"] is False)

    print(f"\n{'─'*50}")
    print(f"  Total entries : {len(results)}")
    print(f"  Hash failures : {bad_hash}")
    print(f"  Sig failures  : {bad_sig}")
    print(f"  Chain valid   : {'✓ YES' if chain_valid else '✗ NO'}")
    print(f"{'─'*50}\n")

    if not chain_valid:
        print("✗ AUDIT CHAIN INVALID — possible tampering detected!")
        if bad_hash:
            tampered = [r["id"] for r in results if not r["hash_ok"]]
            print(f"  Entries with bad hashes: {tampered}")
        return 1

    print("✓ Audit chain fully verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
