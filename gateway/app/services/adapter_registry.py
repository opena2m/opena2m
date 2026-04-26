"""Adapter registry — discovers, loads, and DB-registers domain adapter plugins."""
from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger("aimp.adapter_registry")

# Domain schema files bundled with the project
_SCHEMA_CANDIDATES = [
    Path(__file__).parents[4] / "docs" / "schemas",   # repo root layout
    Path(__file__).parents[3] / "schemas",             # installed package layout
    Path(__file__).parent / "schemas",                 # fallback beside services/
]

_DOMAIN_META: Dict[str, dict] = {
    "manufacturing.print.2d.v1": {
        "schema_file": "aimp-schema-domain-03-manufacturing_print_2d_v1_schema.json",
        "schema_uri": "https://aimp.dev/schemas/domain/manufacturing/print/2d/v1",
    },
    "manufacturing.additive.fdm.v1": {
        "schema_file": "aimp-schema-domain-04-manufacturing_additive_fdm_v1_schema.json",
        "schema_uri": "https://aimp.dev/schemas/domain/manufacturing/additive/fdm/v1",
    },
}


def _load_schema(filename: str) -> dict:
    for d in _SCHEMA_CANDIDATES:
        p = d / filename
        if p.exists():
            try:
                return json.loads(p.read_text())
            except Exception as exc:
                logger.warning("Could not parse schema %s: %s", p, exc)
    logger.warning("Schema file not found: %s", filename)
    return {}


class AdapterRegistry:
    """Singleton registry: domain_id → adapter instance."""

    def __init__(self) -> None:
        self._adapters: Dict[str, "BaseAdapter"] = {}

    async def load_all(self) -> None:
        """Load built-in adapters and upsert their domain rows in the DB."""
        from app.adapters.print2d_sim import create_adapter as mk_print2d
        from app.adapters.fdm_sim import create_adapter as mk_fdm

        for factory in (mk_print2d, mk_fdm):
            try:
                adapter = factory()
                self._adapters[adapter.domain_id] = adapter
                logger.info("Loaded adapter: %s v%s", adapter.domain_id, adapter.version)
                await self._upsert_domain(adapter)
            except Exception as exc:
                logger.error("Failed to load adapter from %s: %s", factory, exc, exc_info=True)

    async def _upsert_domain(self, adapter: "BaseAdapter") -> None:
        """Create or update the Domain row so device FK constraints pass."""
        from sqlalchemy import select
        from app.core.database import AsyncSessionLocal
        from app.models.orm import Domain

        meta = _DOMAIN_META.get(adapter.domain_id, {})
        schema_json = _load_schema(meta["schema_file"]) if meta.get("schema_file") else {}
        schema_uri = meta.get(
            "schema_uri",
            f"https://aimp.dev/schemas/domain/{adapter.domain_id}",
        )

        try:
            async with AsyncSessionLocal() as db:
                row = (
                    await db.execute(
                        select(Domain).where(Domain.domain_id == adapter.domain_id)
                    )
                ).scalar_one_or_none()

                if row is None:
                    db.add(Domain(
                        domain_id=adapter.domain_id,
                        schema_uri=schema_uri,
                        schema_json=schema_json,
                        adapter_package=f"opena2m.adapters.{adapter.domain_id}",
                        adapter_version=adapter.version,
                    ))
                else:
                    row.adapter_version = adapter.version
                    if schema_json:
                        row.schema_json = schema_json

                await db.commit()
                logger.info("Domain upserted in DB: %s", adapter.domain_id)
        except Exception as exc:
            # Non-fatal: the gateway can still operate without the domain row
            logger.warning("Could not upsert domain %s: %s", adapter.domain_id, exc)

    def get(self, domain_id: str) -> Optional["BaseAdapter"]:
        return self._adapters.get(domain_id)

    def list_domains(self) -> List[str]:
        return list(self._adapters.keys())

    def all(self) -> Dict[str, "BaseAdapter"]:
        return dict(self._adapters)


adapter_registry = AdapterRegistry()
