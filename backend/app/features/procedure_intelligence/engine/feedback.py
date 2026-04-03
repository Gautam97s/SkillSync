from app.features.realtime_feedback.schemas.response import FeedbackItem


def generate_feedback(*, valid: bool, angles: dict[str, float], distances: dict[str, float]) -> list[FeedbackItem]:
    if valid:
        return [
            FeedbackItem(
                code="OK",
                message="Grip is stable and aligned for current step.",
                severity="info",
            )
        ]

    return [
        FeedbackItem(
            code="GRIP_ANGLE_OUT_OF_RANGE",
            message=(
                "Adjust thumb-index angle closer to target range and reduce spacing "
                f"(angle={angles.get('thumb_index_angle', 0.0):.2f}, "
                f"distance={distances.get('thumb_index_distance', 0.0):.2f})."
            ),
            severity="warning",
        )
    ]
