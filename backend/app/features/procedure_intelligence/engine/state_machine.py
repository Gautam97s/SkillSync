from __future__ import annotations

from dataclasses import dataclass
from time import time
from typing import Final

from app.features.procedure_intelligence.engine.schema import load_procedure_schema


@dataclass
class SessionState:
    current_step_id: str
    step_valid_since_ms: int | None = None
    step_invalid_since_ms: int | None = None
    mcp_out_of_range_since_ms: int | None = None
    completed: bool = False


SESSIONS: Final[dict[str, SessionState]] = {}


def _now_ms() -> int:
    return int(time() * 1000)


@dataclass(frozen=True)
class StepUpdate:
    step_started: str
    step_now: str
    advanced: bool
    step_valid_since_ms: int | None
    dwell_remaining_ms: int
    completed: bool
    reset: bool = False


def get_session_state(
    *,
    procedure_id: str = "surgical_knot_tying",
    session_key: str | None = None,
) -> SessionState:
    schema = load_procedure_schema(procedure_id)
    steps_by_id = schema.step_by_id()

    key = session_key or procedure_id
    state = SESSIONS.get(key)
    if state is None or state.current_step_id not in steps_by_id:
        state = SessionState(current_step_id=schema.steps[0].id)
        SESSIONS[key] = state
    return state


def update_step(
    *,
    procedure_id: str = "surgical_knot_tying",
    session_key: str | None = None,
    valid_constraints: bool,
    mcp_in_range: bool | None = None,
    timestamp_ms: int | None = None,
    now_ms: int | None = None,
) -> StepUpdate:
    """
    Update dwell-time timing for the current step and possibly advance.

    Returns a structured update containing:
    - which step we started on this frame
    - which step we are on after timing/advance
    - whether we advanced
    - dwell remaining after this frame's timing update (0 if advanced or dwell not required)
    """
    schema = load_procedure_schema(procedure_id)
    steps_by_id = schema.step_by_id()

    state = get_session_state(procedure_id=procedure_id, session_key=session_key)
    step_started = state.current_step_id
    step_schema = steps_by_id[step_started]

    t_ms = (
        timestamp_ms
        if timestamp_ms is not None
        else (_now_ms() if now_ms is None else now_ms)
    )

    # Global safety constraint: if MCP is out of range continuously for 3 seconds,
    # reset the entire procedure to the first step (clears any "checkbox" progress).
    # This applies regardless of current step.
    if mcp_in_range is False:
        if state.mcp_out_of_range_since_ms is None:
            state.mcp_out_of_range_since_ms = int(t_ms)
        if int(t_ms - state.mcp_out_of_range_since_ms) >= 3000:
            state.current_step_id = schema.steps[0].id
            state.step_valid_since_ms = None
            state.step_invalid_since_ms = None
            state.mcp_out_of_range_since_ms = None
            state.completed = False
            return StepUpdate(
                step_started=step_started,
                step_now=state.current_step_id,
                advanced=False,
                step_valid_since_ms=state.step_valid_since_ms,
                dwell_remaining_ms=0,
                completed=state.completed,
                reset=True,
            )
    elif mcp_in_range is True:
        state.mcp_out_of_range_since_ms = None

    if not valid_constraints:
        state.step_valid_since_ms = None
        state.step_invalid_since_ms = None
        # Leave MCP timer as-is; it's controlled above by mcp_in_range.
        state.completed = state.current_step_id == "completed"
        return StepUpdate(
            step_started=step_started,
            step_now=state.current_step_id,
            advanced=False,
            step_valid_since_ms=state.step_valid_since_ms,
            dwell_remaining_ms=0,
            completed=state.completed,
            reset=False,
        )

    if state.step_valid_since_ms is None:
        state.step_valid_since_ms = int(t_ms)
    state.step_invalid_since_ms = None

    dwell_ms = int(step_schema.dwell_time_ms)
    if dwell_ms <= 0:
        # No dwell gate; advance immediately on a valid frame.
        nxt = step_schema.next_step
        state.current_step_id = nxt
        state.step_valid_since_ms = None
        state.step_invalid_since_ms = None
        state.completed = nxt == "completed"
        return StepUpdate(
            step_started=step_started,
            step_now=nxt,
            advanced=nxt != step_started,
            step_valid_since_ms=state.step_valid_since_ms,
            dwell_remaining_ms=0,
            completed=state.completed,
            reset=False,
        )

    elapsed_ms = int(t_ms - state.step_valid_since_ms)
    remaining_ms = dwell_ms - elapsed_ms
    if remaining_ms > 0:
        state.completed = state.current_step_id == "completed"
        return StepUpdate(
            step_started=step_started,
            step_now=state.current_step_id,
            advanced=False,
            step_valid_since_ms=state.step_valid_since_ms,
            dwell_remaining_ms=int(remaining_ms),
            completed=state.completed,
            reset=False,
        )

    nxt = step_schema.next_step
    state.current_step_id = nxt
    state.step_valid_since_ms = None
    state.step_invalid_since_ms = None
    state.completed = nxt == "completed"
    return StepUpdate(
        step_started=step_started,
        step_now=nxt,
        advanced=nxt != step_started,
        step_valid_since_ms=state.step_valid_since_ms,
        dwell_remaining_ms=0,
        completed=state.completed,
        reset=False,
    )


def next_step(
    *,
    valid: bool,
    procedure_id: str = "surgical_knot_tying",
    session_key: str | None = None,
    timestamp_ms: int | None = None,
    now_ms: int | None = None,
) -> str:
    """
    Advance the procedure state machine with dwell-time gating.

    The state machine should only advance after the current step has remained
    valid for at least `dwell_time_ms` based on per-frame timestamps.

    `now_ms` is retained for backward-compat; prefer `timestamp_ms`.
    """
    return update_step(
        valid_constraints=valid,
        procedure_id=procedure_id,
        session_key=session_key,
        timestamp_ms=timestamp_ms,
        now_ms=now_ms,
    ).step_now


def get_current_step_id(
    *,
    procedure_id: str = "surgical_knot_tying",
    session_key: str | None = None,
) -> str:
    """
    Return the current step id for a session without advancing.
    Initializes the session if needed.
    """
    return get_session_state(procedure_id=procedure_id, session_key=session_key).current_step_id


def get_dwell_remaining_ms(
    *,
    procedure_id: str = "surgical_knot_tying",
    session_key: str | None = None,
    timestamp_ms: int | None = None,
    now_ms: int | None = None,
) -> int:
    """
    Return remaining dwell time for the current step in a session.

    If dwell is not required, returns 0.
    If the step has not been held valid yet (no valid-since timestamp), returns full dwell time.

    `now_ms` is retained for backward-compat; prefer `timestamp_ms`.
    """
    schema = load_procedure_schema(procedure_id)
    steps_by_id = schema.step_by_id()

    state = get_session_state(procedure_id=procedure_id, session_key=session_key)

    step_schema = steps_by_id[state.current_step_id]
    dwell_ms = int(step_schema.dwell_time_ms)
    if dwell_ms <= 0:
        return 0

    if state.step_valid_since_ms is None:
        return dwell_ms

    t_ms = (
        timestamp_ms
        if timestamp_ms is not None
        else (_now_ms() if now_ms is None else now_ms)
    )
    elapsed_ms = int(t_ms - state.step_valid_since_ms)
    remaining = dwell_ms - elapsed_ms
    return int(remaining) if remaining > 0 else 0
