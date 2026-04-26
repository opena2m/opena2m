"""Pydantic v2 schemas for AIMP protocol request/response envelopes."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ─── Common envelope ──────────────────────────────────────────────────────────

class RequestMetadata(BaseModel):
    creator: Optional[str] = None
    trace_id: Optional[str] = None
    tags: Optional[Dict[str, str]] = None


class RequestEnvelope(BaseModel):
    aimp_version: str = "1.0"
    job_id: str
    timestamp: Optional[datetime] = None
    idempotency_key: Optional[str] = None
    metadata: Optional[RequestMetadata] = None


class AssetRef(BaseModel):
    type: str  # 3D_MODEL | IMAGE | GCODE | DOCUMENT | ...
    format: str  # MIME type
    url: Optional[str] = None
    inline_data: Optional[str] = None  # base64 for small payloads
    hash_sha256: Optional[str] = None
    size_bytes: Optional[int] = None


class LogisticsInfo(BaseModel):
    recipient_name: Optional[str] = None
    address: Optional[Dict[str, str]] = None
    shipping_method: Optional[str] = None
    notes: Optional[str] = None


class BudgetLimit(BaseModel):
    amount: float
    currency: str = "USD"


# ─── Discover ─────────────────────────────────────────────────────────────────

class DeviceFilter(BaseModel):
    domains: Optional[List[str]] = None
    device_ids: Optional[List[str]] = None


class DiscoverRequest(BaseModel):
    envelope: RequestEnvelope
    device_filter: Optional[DeviceFilter] = None


class ConsumableInfo(BaseModel):
    name: str
    quantity: float
    unit: str


class DeviceInfo(BaseModel):
    device_id: str
    display_name: Optional[str] = None
    device_class: Optional[str] = None
    domains: List[str] = []
    state: str = "UNKNOWN"
    risk_tier: Optional[str] = None
    conformance: Optional[str] = None
    consumables: List[ConsumableInfo] = []
    capabilities: Optional[Dict[str, Any]] = None
    audit_channels: List[str] = []
    location: Optional[Dict[str, str]] = None


class DiscoverResponse(BaseModel):
    job_id: str
    aimp_version: str = "1.0"
    conformance_level: str = "L3"
    devices: List[DeviceInfo] = []


# ─── Quote ────────────────────────────────────────────────────────────────────

class QuoteRequest(BaseModel):
    envelope: RequestEnvelope
    device_id: str
    domain: str
    asset: Optional[AssetRef] = None
    payload: Optional[Dict[str, Any]] = None
    logistics: Optional[LogisticsInfo] = None
    budget_limit: Optional[BudgetLimit] = None


class CostBreakdown(BaseModel):
    material: float = 0.0
    machine_time: float = 0.0
    logistics: float = 0.0
    service_fee: float = 0.0


class EstimatedCost(BaseModel):
    currency: str = "USD"
    amount: float
    breakdown: Optional[CostBreakdown] = None


class ResourceConsumption(BaseModel):
    material: Optional[List[Dict[str, Any]]] = None
    machine_time_seconds: Optional[int] = None
    energy_kwh: Optional[float] = None


class QuoteResponse(BaseModel):
    job_id: str
    state: str = "QUOTED"
    quote_id: str
    estimated_cost: EstimatedCost
    resource_consumption: Optional[ResourceConsumption] = None
    valid_until: datetime
    exceeds_budget: bool = False
    risk_tier: Optional[str] = None
    requires_approval: bool = False


# ─── Execute ──────────────────────────────────────────────────────────────────

class AuditRequirements(BaseModel):
    snapshot_interval_seconds: Optional[int] = 180
    sensors: Optional[List[str]] = None
    ai_vision_checks: Optional[List[str]] = None
    pause_for_human_at: Optional[List[str]] = None


class ExecuteRequest(BaseModel):
    envelope: RequestEnvelope
    quote_id: str
    approval_token: Optional[str] = None
    audit_requirements: Optional[AuditRequirements] = None


class ExecuteResponse(BaseModel):
    job_id: str
    state: str = "LOCKED"
    transition_eta: Optional[datetime] = None


# ─── Telemetry ────────────────────────────────────────────────────────────────

class SensorReading(BaseModel):
    channel: str
    value: Any
    unit: Optional[str] = None
    at: datetime


class MediaRef(BaseModel):
    channel: str
    kind: str
    url: str
    captured_at: datetime
    expires_at: Optional[datetime] = None


class VisionCheckResult(BaseModel):
    check_name: str
    passed: bool
    confidence: Optional[float] = None
    detail: Optional[str] = None
    at: datetime


class HumanActionRequired(BaseModel):
    review_id: str
    reason: str
    instructions: Optional[str] = None
    checkpoint: Optional[str] = None
    deadline: Optional[datetime] = None
    approve_url: Optional[str] = None


class TelemetryResponse(BaseModel):
    job_id: str
    state: str
    progress: float
    updated_at: datetime
    domain: Optional[str] = None
    device_id: Optional[str] = None
    sensor_readings: List[SensorReading] = []
    media: List[MediaRef] = []
    vision_checks: List[VisionCheckResult] = []
    human_action_required: Optional[HumanActionRequired] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None


# ─── Abort ────────────────────────────────────────────────────────────────────

class AbortRequest(BaseModel):
    envelope: RequestEnvelope
    reason: Optional[str] = None
    recovery_mode: str = "safe_home"  # safe_home | hard_stop | freeze


class PartialOutput(BaseModel):
    kind: str
    description: str
    disposal: Optional[str] = None


class AbortResponse(BaseModel):
    job_id: str
    state: str = "ABORTED"
    final_cost: Optional[EstimatedCost] = None
    partial_outputs: List[PartialOutput] = []


# ─── Resume (HITL) ────────────────────────────────────────────────────────────

class ResumeRequest(BaseModel):
    envelope: RequestEnvelope
    approval_token: str
    decision: str = "approve"  # approve | reject
    reviewer_note: Optional[str] = None


class ResumeResponse(BaseModel):
    job_id: str
    state: str  # EXECUTING or ABORTED


# ─── Job detail ───────────────────────────────────────────────────────────────

class JobDetail(BaseModel):
    job_id: str
    state: str
    progress: float
    domain: Optional[str] = None
    device_id: Optional[str] = None
    principal_id: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class JobListResponse(BaseModel):
    jobs: List[JobDetail]
    total: int
    page: int
    page_size: int


# ─── Webhook ──────────────────────────────────────────────────────────────────

class WebhookCreate(BaseModel):
    url: str
    events: List[str] = ["state_transition"]
    hmac_secret: Optional[str] = None


class WebhookResponse(BaseModel):
    endpoint_id: str
    url: str
    events: List[str]
    enabled: bool


# ─── Policy ───────────────────────────────────────────────────────────────────

class PolicyRule(BaseModel):
    conditions: Dict[str, Any]
    action: str  # allow | deny | require_approval | require_hitl


class PolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    priority: int = 100
    rule: PolicyRule


class PolicyResponse(BaseModel):
    policy_id: str
    name: str
    description: Optional[str] = None
    priority: int
    enabled: bool
    rule: PolicyRule


# ─── Budget ───────────────────────────────────────────────────────────────────

class BudgetCreate(BaseModel):
    name: str
    principal_id: Optional[str] = None
    currency: str = "USD"
    ceiling: float
    warn_threshold: float = 0.8
    period: Optional[str] = None  # daily | monthly | total


class BudgetResponse(BaseModel):
    budget_id: str
    name: str
    currency: str
    ceiling: float
    consumed: float
    warn_threshold: float
    period: Optional[str] = None
    utilization: float  # consumed / ceiling
