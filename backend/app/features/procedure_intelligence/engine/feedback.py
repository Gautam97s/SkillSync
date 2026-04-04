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
    plain_message = _PLAIN_FEEDBACK_BY_CONSTRAINT.get(
        key,
        "Adjust your grip and try to match the target position.",
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
