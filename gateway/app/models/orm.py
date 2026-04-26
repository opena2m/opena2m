"""SQLAlchemy ORM models for the OpenA2M Gateway."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, JSON
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def _now():
    return datetime.now(timezone.utc)


def _ulid():
    import time, random, string
    ts = int(time.time() * 1000)
    chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    time_part = ""
    t = ts
    for _ in range(10):
        time_part = chars[t % 32] + time_part
        t //= 32
    rand_part = "".join(random.choices(chars, k=16))
    return time_part + rand_part


class Principal(Base):
    __tablename__ = "principals"
    principal_id = Column(String(26), primary_key=True, default=_ulid)
    kind = Column(String(16), nullable=False)  # agent | human | system
    display_name = Column(Text, nullable=False)
    external_id = Column(String(256), unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    disabled_at = Column(DateTime(timezone=True), nullable=True)

    api_tokens = relationship("ApiToken", back_populates="principal")


class ApiToken(Base):
    __tablename__ = "api_tokens"
    token_id = Column(String(26), primary_key=True, default=_ulid)
    principal_id = Column(String(26), ForeignKey("principals.principal_id"), nullable=False)
    token_hash = Column(String(64), nullable=False)  # sha256(token)
    scope_json = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    principal = relationship("Principal", back_populates="api_tokens")


class Domain(Base):
    __tablename__ = "domains"
    domain_id = Column(String(256), primary_key=True)
    schema_uri = Column(Text, nullable=False)
    schema_json = Column(JSON, nullable=False, default=dict)
    adapter_package = Column(Text, nullable=False)
    adapter_version = Column(String(32), nullable=False)
    registered_at = Column(DateTime(timezone=True), default=_now, nullable=False)



class Device(Base):
    __tablename__ = "devices"
    device_id = Column(String(128), primary_key=True)
    display_name = Column(Text, nullable=True)
    vendor = Column(String(128), nullable=True)
    model = Column(String(128), nullable=True)
    firmware = Column(String(64), nullable=True)
    location_json = Column(JSON, nullable=True)
    risk_tier = Column(String(16), nullable=True)  # routine | restricted | hazardous
    conformance = Column(String(4), nullable=True)  # L1 | L2 | L3
    status_json = Column(JSON, nullable=False, default=dict)
    capabilities_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    disabled_at = Column(DateTime(timezone=True), nullable=True)

    device_domains = relationship("DeviceDomain", back_populates="device")
    jobs = relationship("Job", back_populates="device")


class DeviceDomain(Base):
    __tablename__ = "device_domains"
    device_id = Column(String(128), ForeignKey("devices.device_id"), primary_key=True)
    # No FK on domain_id: domains are upserted async at startup
    domain_id = Column(String(256), primary_key=True)

    device = relationship("Device", back_populates="device_domains")


class Job(Base):
    __tablename__ = "jobs"
    job_id = Column(String(26), primary_key=True)
    device_id = Column(String(128), ForeignKey("devices.device_id"), nullable=True)
    domain_id = Column(String(256), nullable=True)
    principal_id = Column(String(26), ForeignKey("principals.principal_id"), nullable=True)
    state = Column(String(16), nullable=False, default="PENDING")
    progress = Column(Float, nullable=False, default=0.0)
    request_json = Column(JSON, nullable=True)
    asset_json = Column(JSON, nullable=True)
    payload_json = Column(JSON, nullable=True)
    logistics_json = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    idempotency_key = Column(String(256), nullable=True, unique=True)
    error_code = Column(String(64), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    device = relationship("Device", back_populates="jobs")
    quotes = relationship("Quote", back_populates="job")
    transitions = relationship("JobStateTransition", back_populates="job", order_by="JobStateTransition.id")
    telemetry_events = relationship("TelemetryEvent", back_populates="job")
    audit_entries = relationship("AuditEntry", back_populates="job")


class Quote(Base):
    __tablename__ = "quotes"
    quote_id = Column(String(26), primary_key=True, default=_ulid)
    job_id = Column(String(26), ForeignKey("jobs.job_id"), nullable=False)
    device_id = Column(String(128), nullable=False)
    domain_id = Column(String(256), nullable=False)
    estimated_cost_json = Column(JSON, nullable=False)
    resource_consumption_json = Column(JSON, nullable=True)
    budget_reserve_json = Column(JSON, nullable=True)
    valid_until = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    job = relationship("Job", back_populates="quotes")


class JobStateTransition(Base):
    __tablename__ = "job_state_transitions"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id = Column(String(26), ForeignKey("jobs.job_id"), nullable=False)
    from_state = Column(String(16), nullable=True)
    to_state = Column(String(16), nullable=False)
    principal_id = Column(String(26), nullable=True)
    reason = Column(Text, nullable=True)
    entry_hash = Column(String(64), nullable=True)
    signature = Column(Text, nullable=True)
    at = Column(DateTime(timezone=True), default=_now, nullable=False)

    job = relationship("Job", back_populates="transitions")


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id = Column(String(26), ForeignKey("jobs.job_id"), nullable=False)
    channel = Column(String(128), nullable=False)
    kind = Column(String(32), nullable=False)  # sensor | media | log | vision_check
    value_json = Column(JSON, nullable=True)
    media_url = Column(Text, nullable=True)
    media_expires_at = Column(DateTime(timezone=True), nullable=True)
    at = Column(DateTime(timezone=True), default=_now, nullable=False)

    job = relationship("Job", back_populates="telemetry_events")


class AuditEntry(Base):
    __tablename__ = "audit_entries"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id = Column(String(26), ForeignKey("jobs.job_id"), nullable=True)
    event_type = Column(String(64), nullable=False)
    principal_id = Column(String(26), nullable=True)
    payload_json = Column(JSON, nullable=True)
    entry_hash = Column(String(64), nullable=True)
    signature = Column(Text, nullable=True)
    at = Column(DateTime(timezone=True), default=_now, nullable=False)

    job = relationship("Job", back_populates="audit_entries")


class Policy(Base):
    __tablename__ = "policies"
    policy_id = Column(String(26), primary_key=True, default=_ulid)
    name = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Integer, nullable=False, default=100)
    enabled = Column(Boolean, nullable=False, default=True)
    rule_json = Column(JSON, nullable=False)  # {conditions, action}
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class Budget(Base):
    __tablename__ = "budgets"
    budget_id = Column(String(26), primary_key=True, default=_ulid)
    name = Column(String(256), nullable=False)
    principal_id = Column(String(26), ForeignKey("principals.principal_id"), nullable=True)
    currency = Column(String(3), nullable=False, default="USD")
    ceiling = Column(Float, nullable=False)
    consumed = Column(Float, nullable=False, default=0.0)
    warn_threshold = Column(Float, nullable=False, default=0.8)
    period = Column(String(16), nullable=True)  # daily | monthly | total
    period_start = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"
    endpoint_id = Column(String(26), primary_key=True, default=_ulid)
    principal_id = Column(String(26), ForeignKey("principals.principal_id"), nullable=True)
    url = Column(Text, nullable=False)
    hmac_secret = Column(String(64), nullable=False)
    events = Column(JSON, nullable=False, default=list)  # ["state_transition", ...]
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    delivery_attempts = relationship("WebhookDelivery", back_populates="endpoint")


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    endpoint_id = Column(String(26), ForeignKey("webhook_endpoints.endpoint_id"), nullable=False)
    job_id = Column(String(26), nullable=True)
    event_type = Column(String(64), nullable=False)
    payload_json = Column(JSON, nullable=False)
    status = Column(String(16), nullable=False, default="pending")  # pending | sent | failed | dlq
    attempt = Column(Integer, nullable=False, default=0)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)
    response_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)

    endpoint = relationship("WebhookEndpoint", back_populates="delivery_attempts")
