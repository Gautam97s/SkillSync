from app.features.realtime_feedback.schemas.response import FeedbackItem

from app.features.procedure_intelligence.engine.rules import ValidationResult
from app.features.procedure_intelligence.engine.state_machine import StepUpdate


def _fmt_num(x: float) -> str:
    return f"{float(x):.2f}"


def _violation_feedback_items(*, violations: list[dict]) -> list[FeedbackItem]:
    if not violations:
        return [
            FeedbackItem(
                code="CONSTRAINT_INVALID",
                message="Constraints are invalid. Adjust your position to match the target ranges.",
                severity="warning",
            )
        ]

    items: list[FeedbackItem] = []
    for v in violations:
        key = str(v.get("constraint_key") or "constraint")
        expected = v.get("expected") or {}
        actual = float(v.get("actual") or 0.0)
        deviation = float(v.get("deviation_amount") or 0.0)

        direction: str
        target_desc: str
        if "min" in expected and actual < float(expected["min"]):
            direction = "increase"
            target_desc = f"at least {_fmt_num(expected['min'])}"
        elif "max" in expected and actual > float(expected["max"]):
            direction = "decrease"
            target_desc = f"at most {_fmt_num(expected['max'])}"
        elif "max" in expected:
            # Distance constraints are max-only; if we're here it's an overage.
            direction = "decrease"
            target_desc = f"at most {_fmt_num(expected['max'])}"
        else:
            direction = "adjust"
            target_desc = "within the allowed range"

        items.append(
            FeedbackItem(
                code=f"{key.upper()}_VIOLATION",
                message=(
                    f"{key}: {direction} by {_fmt_num(deviation)} "
                    f"(actual={_fmt_num(actual)}, target={target_desc})."
                ),
                severity="warning",
            )
        )

    return items


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
    if not validation.valid and step_update.step_started == "grip_init":
        return [
            FeedbackItem(
                code="GRIP_NOT_DETECTED",
                message="No grip detected yet. Hold the pen between thumb and index finger before moving on.",
                severity="warning",
            )
        ]

    if not validation.valid:
        return _violation_feedback_items(violations=list(validation.violations or []))

    if int(step_update.dwell_remaining_ms) > 0:
        return [
            FeedbackItem(
                code="DWELL_REMAINING",
                message=f"Hold this position for {int(step_update.dwell_remaining_ms)} more ms.",
                severity="info",
            )
        ]

    if step_update.advanced and step_update.step_now != step_update.step_started:
        return [
            FeedbackItem(
                code="STEP_COMPLETE",
                message=f"Step complete, moving to {step_update.step_now}.",
                severity="info",
            )
        ]

    return [
        FeedbackItem(
            code="OK",
            message="Constraints satisfied.",
            severity="info",
        )
    ]
