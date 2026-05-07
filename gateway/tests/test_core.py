"""
OpenA2M Gateway — unit tests.
Run: cd gateway && pytest tests/ -v
"""
import pytest
from app.core.state_machine import (
    JobState, StateMachineError, validate_transition, can_abort, is_terminal
)
from app.core.audit import AuditLog


# ─── State machine tests ──────────────────────────────────────────────────────

class TestStateMachine:
    def test_valid_pending_to_quoted(self):
        validate_transition(JobState.PENDING, JobState.QUOTED)  # must not raise

    def test_valid_quoted_to_locked(self):
        validate_transition(JobState.QUOTED, JobState.LOCKED)

    def test_valid_locked_to_executing(self):
        validate_transition(JobState.LOCKED, JobState.EXECUTING)

    def test_valid_executing_to_auditing(self):
        validate_transition(JobState.EXECUTING, JobState.AUDITING)

    def test_valid_auditing_to_executing(self):
        validate_transition(JobState.AUDITING, JobState.EXECUTING)

    def test_valid_executing_to_completed(self):
        validate_transition(JobState.EXECUTING, JobState.COMPLETED)

    def test_invalid_pending_to_executing(self):
        with pytest.raises(StateMachineError):
            validate_transition(JobState.PENDING, JobState.EXECUTING)

    def test_invalid_completed_to_executing(self):
        with pytest.raises(StateMachineError):
            validate_transition(JobState.COMPLETED, JobState.EXECUTING)

    def test_any_to_aborted_allowed(self):
        for state in [JobState.PENDING, JobState.QUOTED, JobState.LOCKED, JobState.EXECUTING, JobState.AUDITING, JobState.FULFILLING]:
            validate_transition(state, JobState.ABORTED)

    def test_terminal_aborted_no_transitions(self):
        with pytest.raises(StateMachineError):
            validate_transition(JobState.ABORTED, JobState.PENDING)

    def test_terminal_failed_no_transitions(self):
        with pytest.raises(StateMachineError):
            validate_transition(JobState.FAILED, JobState.EXECUTING)

    def test_is_terminal(self):
        assert is_terminal(JobState.COMPLETED)
        assert is_terminal(JobState.ABORTED)
        assert is_terminal(JobState.FAILED)
        assert not is_terminal(JobState.EXECUTING)
        assert not is_terminal(JobState.AUDITING)

    def test_can_abort(self):
        assert can_abort(JobState.EXECUTING)
        assert can_abort(JobState.AUDITING)
        assert can_abort(JobState.PENDING)
        assert not can_abort(JobState.COMPLETED)
        assert not can_abort(JobState.ABORTED)


# ─── Audit log tests ──────────────────────────────────────────────────────────

class TestAuditLog:
    def setup_method(self):
        # Reset last hash for deterministic tests
        import app.core.audit as audit_mod
        audit_mod._last_hash = "0" * 64
        audit_mod._private_key = None  # disable signing for unit tests

    def test_sign_entry_returns_hash(self):
        entry = {"event_type": "state_transition", "job_id": "test-1", "to_state": "QUOTED"}
        h, sig = AuditLog.sign_entry(entry)
        assert len(h) == 64
        assert sig == ""  # no key loaded

    def test_hash_chain_is_deterministic(self):
        import app.core.audit as audit_mod
        audit_mod._last_hash = "0" * 64
        e1 = {"a": 1}
        h1, _ = AuditLog.sign_entry(e1)
        audit_mod._last_hash = "0" * 64
        h2, _ = AuditLog.sign_entry(e1)
        assert h1 == h2

    def test_different_entries_different_hashes(self):
        e1 = {"a": 1}
        e2 = {"a": 2}
        h1, _ = AuditLog.sign_entry(e1)
        h2, _ = AuditLog.sign_entry(e2)
        assert h1 != h2

    def test_verify_chain_detects_tampering(self):
        import app.core.audit as audit_mod
        audit_mod._last_hash = "0" * 64
        entries = []
        for i in range(3):
            data = {"id": i + 1, "event_type": "test", "job_id": "x", "value": i}
            h, sig = AuditLog.sign_entry(data)
            entries.append({**data, "entry_hash": h, "signature": sig})
        # Tamper with middle entry
        entries[1]["value"] = 999
        results = AuditLog.verify_chain(entries)
        assert results[0]["hash_ok"]
        assert not results[1]["hash_ok"]   # tampered
        assert not results[2]["hash_ok"]   # chain broken downstream


# ─── Policy engine tests ──────────────────────────────────────────────────────

class TestPolicyEngine:
    @pytest.mark.asyncio
    async def test_routine_allowed(self):
        from unittest.mock import AsyncMock, MagicMock
        from app.services.policy_engine import PolicyEngine, PolicyContext
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))))
        ctx = PolicyContext(
            principal_id="agent://test",
            principal_kind="agent",
            domain_id="manufacturing.print.2d.v1",
            device_id="cloudprint-sim-1",
            risk_tier="routine",
            estimated_amount=5.0,
            currency="USD",
            budget_limit=50.0,
        )
        verdict = await PolicyEngine.evaluate(db, ctx)
        assert verdict.action == "allow"

    @pytest.mark.asyncio
    async def test_restricted_requires_hitl(self):
        from unittest.mock import AsyncMock, MagicMock
        from app.services.policy_engine import PolicyEngine, PolicyContext
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))))
        ctx = PolicyContext(
            principal_id="agent://test",
            principal_kind="agent",
            domain_id="manufacturing.additive.fdm.v1",
            device_id="fdm-sim-1",
            risk_tier="restricted",
            estimated_amount=15.0,
            currency="USD",
            budget_limit=50.0,
        )
        verdict = await PolicyEngine.evaluate(db, ctx)
        assert verdict.action == "require_hitl"

    @pytest.mark.asyncio
    async def test_hazardous_requires_approval(self):
        """Per AIMP §04 H5: hazardous tier triggers require_approval, not deny."""
        from unittest.mock import AsyncMock, MagicMock
        from app.services.policy_engine import PolicyEngine, PolicyContext
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))))
        ctx = PolicyContext(
            principal_id="agent://test",
            principal_kind="agent",
            domain_id="chemistry.reactor.v1",
            device_id="reactor-1",
            risk_tier="hazardous",
            estimated_amount=100.0,
            currency="USD",
            budget_limit=500.0,
        )
        verdict = await PolicyEngine.evaluate(db, ctx)
        assert verdict.action == "require_approval"


# ─── Approval token tests ─────────────────────────────────────────────────────

class TestApprovalToken:
    def test_valid_token_round_trip(self):
        import os
        os.environ.setdefault("AIMP_JWT_SECRET", "test-secret")
        from app.services.approval_token import mint_token, verify_token
        import app.services.approval_token as at_mod
        at_mod._used_tokens.clear()
        token = mint_token("job-123", "human://bob", "mid_build_50_percent")
        valid, reason = verify_token(token, "job-123")
        assert valid, reason

    def test_wrong_job_id_rejected(self):
        from app.services.approval_token import mint_token, verify_token
        import app.services.approval_token as at_mod
        at_mod._used_tokens.clear()
        token = mint_token("job-123", "human://bob", "mid_build_50_percent")
        valid, reason = verify_token(token, "job-999")
        assert not valid
        assert "job-999" in reason

    def test_single_use_enforced(self):
        from app.services.approval_token import mint_token, verify_token
        import app.services.approval_token as at_mod
        at_mod._used_tokens.clear()
        token = mint_token("job-456", "human://bob", "checkpoint")
        verify_token(token, "job-456")       # first use: ok
        valid, reason = verify_token(token, "job-456")  # second use: rejected
        assert not valid
        assert "already used" in reason

    def test_tampered_token_rejected(self):
        from app.services.approval_token import mint_token, verify_token
        import app.services.approval_token as at_mod
        at_mod._used_tokens.clear()
        token = mint_token("job-789", "human://bob", "checkpoint")
        tampered = token[:-5] + "XXXXX"
        valid, reason = verify_token(tampered, "job-789")
        assert not valid


# ─── Budget service tests ─────────────────────────────────────────────────────

class TestBudgetService:
    @pytest.mark.asyncio
    async def test_within_ceiling_ok(self):
        from unittest.mock import AsyncMock, MagicMock
        from app.services.budget_service import BudgetService
        from app.models.orm import Budget
        b = Budget(budget_id="b1", name="test", principal_id="p1",
                   currency="USD", ceiling=100.0, consumed=10.0, warn_threshold=0.8)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[b])))))
        db.flush = AsyncMock()
        ok, reason = await BudgetService.check_and_reserve(db, "p1", 50.0, "USD")
        assert ok
        assert reason is None

    @pytest.mark.asyncio
    async def test_exceeds_ceiling_rejected(self):
        from unittest.mock import AsyncMock, MagicMock
        from app.services.budget_service import BudgetService
        from app.models.orm import Budget
        b = Budget(budget_id="b2", name="test", principal_id="p1",
                   currency="USD", ceiling=100.0, consumed=90.0, warn_threshold=0.8)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[b])))))
        ok, reason = await BudgetService.check_and_reserve(db, "p1", 50.0, "USD")
        assert not ok
        assert "exceeded" in reason
