from app.features.realtime_feedback.schemas.response import FeedbackItem

from app.features.procedure_intelligence.engine.rules import ValidationResult
from app.features.procedure_intelligence.engine.state_machine import StepUpdate


_PLAIN_FEEDBACK_BY_CONSTRAINT: dict[str, str] = {
    "thumb_index_over_palm": "Bring your thumb and index finger a little closer.",
    "index_middle_over_palm": "Move your middle finger closer to your index finger.",
    "index_middle_alignment": "Keep your index and middle finger aligned.",
    "middle_below_index": "Place your middle finger slightly below your index finger for support.",
    "wrist_index_angle": "Adjust your wrist angle and hold it steady.",
}


def _format_target(expected: dict) -> str:
    min_v = expected.get("min")
    max_v = expected.get("max")
    if min_v is not None and max_v is not None:
        return f"{float(min_v):.2f}-{float(max_v):.2f}"
    if max_v is not None:
        return f"<= {float(max_v):.2f}"
    if min_v is not None:
        return f">= {float(min_v):.2f}"
    return "target range"


def _violation_side(*, expected: dict, actual: float) -> str:
    min_v = expected.get("min")
    max_v = expected.get("max")
    if min_v is not None and actual < float(min_v):
        return "low"
    if max_v is not None and actual > float(max_v):
        return "high"
    return "unknown"


def _directional_message(*, key: str, side: str) -> str:
    if key == "thumb_index_over_palm":
        return (
            "Bring your thumb and index finger closer together."
            if side == "high"
            else "Relax the pinch slightly so the fingers are not too tight."
        )
    if key == "index_middle_over_palm":
        return (
            "Move your middle finger closer to your index finger."
            if side == "high"
            else "Let your middle finger separate slightly from your index finger."
        )
    if key == "index_middle_alignment":
        return (
            "Straighten and align your index and middle finger a little more."
            if side == "high"
            else "Reduce the overlap and align both fingers naturally."
        )
    if key == "middle_below_index":
        return (
            "Lift your middle finger slightly upward toward the index finger."
            if side == "high"
            else "Lower your middle finger a little below the index finger."
        )
    if key == "wrist_index_angle":
        return (
            "Open your wrist angle a bit more."
            if side == "low"
            else "Close your wrist angle slightly."
        )

    return (
        "Increase this value slightly to reach the target."
        if side == "low"
        else "Decrease this value slightly to reach the target."
    )


def _violation_feedback_items(*, violations: list[dict]) -> list[FeedbackItem]:
    if not violations:
        return [
            FeedbackItem(
                code="CONSTRAINT_INVALID",
                message="You are close. Adjust your hand position slightly and try again.",
                severity="warning",
            )
        ]

    primary = violations[0]
    key = str(primary.get("constraint_key") or "constraint")
    expected = dict(primary.get("expected") or {})
    actual = float(primary.get("actual") or 0.0)
    side = _violation_side(expected=expected, actual=actual)

    action = _directional_message(key=key, side=side)
    fallback = _PLAIN_FEEDBACK_BY_CONSTRAINT.get(
        key,
        "Adjust your grip and try to match the target position.",
    )
    target_text = _format_target(expected)

    plain_message = (
        f"{action} (Current: {actual:.2f}, target: {target_text})."
        if expected
        else fallback
    )

    return [
        FeedbackItem(
            code=f"{key.upper()}_VIOLATION",
            message=plain_message,
            severity="warning",
        )
    ]


def generate_feedback(
    *,
    validation: ValidationResult,
    step_update: StepUpdate,
) -> list[FeedbackItem]:
    """
    Explainable feedback:
    - If constraints invalid: numeric adjustment derived from violations.
    - Else if constraints valid but dwell not finished: "Hold ... for N more ms" (info).
    - Else (step completed): "Step complete, moving to next_step".

    Returns list[FeedbackItem] for response compatibility.
    """
    if not validation.valid:
        return _violation_feedback_items(violations=list(validation.violations or []))

    if int(step_update.dwell_remaining_ms) > 0:
        seconds_remaining = max(1, int((int(step_update.dwell_remaining_ms) + 999) / 1000))
        return [
            FeedbackItem(
                code="DWELL_REMAINING",
                message=f"Nice. Keep holding for about {seconds_remaining} more second(s).",
                severity="info",
            )
        ]

    if step_update.advanced and step_update.step_now != step_update.step_started:
        return [
            FeedbackItem(
                code="STEP_COMPLETE",
                message="Great job. Step complete, moving to the next one.",
                severity="info",
            )
        ]

    return [
        FeedbackItem(
            code="OK",
            message="Good form. Keep it steady.",
            severity="info",
        )
    ]
