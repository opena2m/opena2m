#!/usr/bin/env python3
"""
INFRA-001 — Validate AIMP JSON Schemas and example payloads.

Iterates every *.json file under docs/aimp/examples/ and validates each
against the corresponding schema in docs/aimp/schemas/.

Also validates the gateway's openapi.json is well-formed OpenAPI 3.x.

Exit codes:
  0 — all schemas valid
  1 — one or more validation errors
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── Optional dependencies ────────────────────────────────────────────────────
try:
    import jsonschema
    _HAS_JSONSCHEMA = True
except ImportError:
    _HAS_JSONSCHEMA = False

# ── Helpers ──────────────────────────────────────────────────────────────────

def _load(path: Path) -> dict:
    with path.open() as f:
        return json.load(f)


def _check_openapi() -> list[str]:
    """Verify gateway/openapi.json is present and parseable as OpenAPI 3.x."""
    errors: list[str] = []
    spec_path = ROOT / "gateway" / "openapi.json"
    if not spec_path.exists():
        errors.append(f"MISSING: gateway/openapi.json — run `make gateway-openapi` to generate")
        return errors
    try:
        spec = _load(spec_path)
    except json.JSONDecodeError as exc:
        errors.append(f"INVALID JSON: gateway/openapi.json — {exc}")
        return errors
    version = spec.get("openapi", "")
    if not version.startswith("3."):
        errors.append(f"INVALID: gateway/openapi.json — expected openapi 3.x, got '{version}'")
        return errors
    paths = spec.get("paths", {})
    required_paths = [
        "/v1/discover",
        "/v1/quote",
        "/v1/execute",
    ]
    for p in required_paths:
        if p not in paths:
            errors.append(f"MISSING PATH in openapi.json: {p}")
    info = spec.get("info", {})
    if not info.get("title"):
        errors.append("openapi.json missing info.title")
    print(f"  ✓ gateway/openapi.json — OpenAPI {version}, {len(paths)} paths")
    return errors


def _check_adapter_schemas() -> list[str]:
    """Validate any adapter schema.json files found in the gateway."""
    errors: list[str] = []
    schema_paths = list((ROOT / "gateway" / "app" / "adapters").rglob("schema.json"))
    if not schema_paths:
        print("  ⚠  No adapter schema.json files found (not an error for current layout)")
        return errors
    for sp in schema_paths:
        try:
            schema = _load(sp)
            if "properties" not in schema and "type" not in schema:
                errors.append(f"SUSPECT: {sp.relative_to(ROOT)} — no 'properties' or 'type' key")
            else:
                print(f"  ✓ {sp.relative_to(ROOT)}")
        except json.JSONDecodeError as exc:
            errors.append(f"INVALID JSON: {sp.relative_to(ROOT)} — {exc}")
    return errors


def _check_example_payloads() -> list[str]:
    """Validate example JSON payloads against their schemas (if jsonschema available)."""
    errors: list[str] = []
    examples_dir = ROOT / "docs" / "aimp" / "examples"
    schemas_dir = ROOT / "docs" / "aimp" / "schemas"

    if not examples_dir.exists():
        print("  ⚠  docs/aimp/examples/ not found — skipping example validation")
        return errors
    if not schemas_dir.exists():
        print("  ⚠  docs/aimp/schemas/ not found — skipping example validation")
        return errors

    example_files = list(examples_dir.rglob("*.json"))
    if not example_files:
        print("  ⚠  No example files in docs/aimp/examples/ — skipping")
        return errors

    if not _HAS_JSONSCHEMA:
        print("  ⚠  jsonschema not installed — install with `pip install jsonschema` for full validation")
        for ef in example_files:
            try:
                _load(ef)
                print(f"  ✓ {ef.relative_to(ROOT)} (JSON parse only)")
            except json.JSONDecodeError as exc:
                errors.append(f"INVALID JSON: {ef.relative_to(ROOT)} — {exc}")
        return errors

    for ef in example_files:
        try:
            payload = _load(ef)
        except json.JSONDecodeError as exc:
            errors.append(f"INVALID JSON: {ef.relative_to(ROOT)} — {exc}")
            continue

        # Infer matching schema: examples/foo.json → schemas/foo.schema.json
        schema_name = ef.stem + ".schema.json"
        schema_path = schemas_dir / schema_name
        if not schema_path.exists():
            # Try core/ subdirectory
            schema_path = schemas_dir / "core" / schema_name
        if not schema_path.exists():
            print(f"  ⚠  {ef.relative_to(ROOT)} — no matching schema found, JSON parse OK")
            continue

        try:
            schema = _load(schema_path)
            jsonschema.validate(payload, schema)
            print(f"  ✓ {ef.relative_to(ROOT)}")
        except jsonschema.ValidationError as exc:
            errors.append(f"SCHEMA FAIL: {ef.relative_to(ROOT)} — {exc.message}")
        except json.JSONDecodeError as exc:
            errors.append(f"INVALID SCHEMA JSON: {schema_path.relative_to(ROOT)} — {exc}")

    return errors


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    print("\n=== AIMP Schema Validation ===\n")
    all_errors: list[str] = []

    print("[ openapi.json ]")
    all_errors += _check_openapi()

    print("\n[ adapter schemas ]")
    all_errors += _check_adapter_schemas()

    print("\n[ example payloads ]")
    all_errors += _check_example_payloads()

    if all_errors:
        print(f"\n✗ {len(all_errors)} error(s):\n")
        for e in all_errors:
            print(f"  • {e}")
        return 1

    print(f"\n✓ All schema checks passed.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
