"""AIMP §01.4 — Nine-state job state machine."""
from __future__ import annotations
from enum import Enum
from typing import Set


class JobState(str, Enum):
    PENDING = "PENDING"
    QUOTED = "QUOTED"
    LOCKED = "LOCKED"
    EXECUTING = "EXECUTING"
    AUDITING = "AUDITING"
    FULFILLING = "FULFILLING"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"
    FAILED = "FAILED"


TERMINAL_STATES: Set[JobState] = {JobState.COMPLETED, JobState.ABORTED, JobState.FAILED}

# Valid transitions map: from_state -> set of allowed to_states
VALID_TRANSITIONS: dict[JobState, Set[JobState]] = {
    JobState.PENDING: {JobState.QUOTED, JobState.ABORTED, JobState.FAILED},
    JobState.QUOTED: {JobState.LOCKED, JobState.ABORTED, JobState.FAILED},
    JobState.LOCKED: {JobState.EXECUTING, JobState.ABORTED, JobState.FAILED},
    JobState.EXECUTING: {JobState.AUDITING, JobState.FULFILLING, JobState.COMPLETED, JobState.ABORTED, JobState.FAILED},
    JobState.AUDITING: {JobState.EXECUTING, JobState.LOCKED, JobState.ABORTED, JobState.FAILED},
    JobState.FULFILLING: {JobState.COMPLETED, JobState.ABORTED, JobState.FAILED},
    JobState.COMPLETED: set(),
    JobState.ABORTED: set(),
    JobState.FAILED: set(),
}

# Client-initiated transitions (others are gateway/adapter-driven)
CLIENT_TRANSITIONS: Set[JobState] = {JobState.ABORTED}
# Resume from AUDITING is special — client triggers EXECUTING
RESUME_FROM: JobState = JobState.AUDITING
RESUME_TO: JobState = JobState.EXECUTING


class StateMachineError(Exception):
    pass


def validate_transition(from_state: JobState, to_state: JobState) -> None:
    """Raise StateMachineError if the transition is not permitted."""
    if from_state in TERMINAL_STATES:
        raise StateMachineError(
            f"Job is in terminal state {from_state}; no transitions allowed."
        )
    allowed = VALID_TRANSITIONS.get(from_state, set())
    if to_state not in allowed:
        raise StateMachineError(
            f"Transition {from_state} → {to_state} is not permitted. "
            f"Allowed: {[s.value for s in allowed]}"
        )


def is_terminal(state: JobState) -> bool:
    return state in TERMINAL_STATES


def can_abort(state: JobState) -> bool:
    return state not in TERMINAL_STATES
