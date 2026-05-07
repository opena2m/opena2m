"""
AIMP Adapter SDK — shared types and data-classes.

These types are the stable public API of the SDK (interface-locked at end W5).
Adapter authors import from here; gateway internals use their own equivalents.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


# ── Enumerations ─────────────────────────────────────────────────────────────

class RiskTier(str, Enum):
    """AIMP §04 risk classification for a domain."""
    ROUTINE = "routine"        # Agent-only; budget ceiling enforced
    RESTRICTED = "restricted"  # Human confirmation required above threshold
    HAZARDOUS = "hazardous"    # Human confirmation on every execute


class ResumeDecision(str, Enum):
    """Possible outcomes of a HITL review (§01.4 resume verb)."""
    CONTINUE = "CONTINUE"  # Resume execution from the pause point
    ABORT = "ABORT"        # Abort the job
    ADJUST = "ADJUST"      # Resume with modified parameters


class VisionVerdict(str, Enum):
    """Outcome of an AI vision check (§05.3)."""
    PASS = "pass"
    WARN = "warn"
    FAILURE = "failure"
    INCONCLUSIVE = "inconclusive"


# ── Sensor & Vision specs ─────────────────────────────────────────────────────

@dataclass
class SensorSpec:
    """Declares a sensor channel an adapter can emit."""
    channel: str          # e.g. "extruder_temp"
    unit: str             # e.g. "celsius"
    description: str = ""
    required: bool = False


@dataclass
class VisionCheckSpec:
    """Declares a named AI vision check an adapter can emit."""
    name: str             # e.g. "detect_spaghetti_failure"
    description: str = ""
    retryable: bool = True


# ── Quote ─────────────────────────────────────────────────────────────────────

@dataclass
class QuoteContext:
    """Context passed to BaseAdapter.compute_quote()."""
    device_id: str
    payload: Dict[str, Any]
    asset: Optional[Dict[str, Any]] = None
    logistics: Optional[Dict[str, Any]] = None
    principal_id: Optional[str] = None


@dataclass
class Quote:
    """Structured quote result returned by compute_quote()."""
    cost_amount: float
    cost_currency: str = "USD"
    machine_time_seconds: int = 0
    breakdown: Dict[str, float] = field(default_factory=dict)
    resource_consumption: Dict[str, Any] = field(default_factory=dict)
    valid_for_seconds: int = 300

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cost": {
                "currency": self.cost_currency,
                "amount": self.cost_amount,
                "breakdown": self.breakdown,
            },
            "resource_consumption": {
                "machine_time_seconds": self.machine_time_seconds,
                **self.resource_consumption,
            },
        }


# ── Adapter manifest ──────────────────────────────────────────────────────────

@dataclass
class AdapterManifest:
    """Metadata returned by BaseAdapter.register() and consumed by the gateway."""
    domain_id: str
    version: str
    display_name: str
    risk_tier: RiskTier
    sensors: List[SensorSpec] = field(default_factory=list)
    vision_checks: List[VisionCheckSpec] = field(default_factory=list)
    schema: Optional[Dict[str, Any]] = None      # JSON Schema for the domain payload
    adapter_timeout_s: int = 300
    supports_adjust: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "domain_id": self.domain_id,
            "version": self.version,
            "display_name": self.display_name,
            "risk_tier": self.risk_tier.value,
            "sensors": [{"channel": s.channel, "unit": s.unit, "required": s.required} for s in self.sensors],
            "vision_checks": [{"name": v.name, "description": v.description} for v in self.vision_checks],
            "adapter_timeout_s": self.adapter_timeout_s,
            "supports_adjust": self.supports_adjust,
        }


# ── Sensor reading ────────────────────────────────────────────────────────────

@dataclass
class SensorReading:
    """A single sensor observation emitted by an adapter."""
    channel: str
    value: float
    unit: str = ""
    at: Optional[str] = None   # ISO 8601 timestamp


# ── Media bundle ─────────────────────────────────────────────────────────────

@dataclass
class MediaBundle:
    """A media capture emitted by an adapter (image, video, etc.)."""
    channel: str
    url: str
    mime_type: str = "image/jpeg"
    at: Optional[str] = None
