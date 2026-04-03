from app.features.hand_tracking.cv.landmarks import normalize_landmarks
from app.features.hand_tracking.feature_engineering.angles import compute_angles
from app.features.hand_tracking.feature_engineering.distances import compute_distances
from app.features.hand_tracking.feature_engineering.smoothing import smooth_landmarks
from app.features.hand_tracking.service.camera_runtime import get_camera_runtime
from app.features.procedure_intelligence.engine.feedback import generate_feedback
from app.features.procedure_intelligence.engine.rules import validate_step
from app.features.procedure_intelligence.engine.scoring import compute_score
from app.features.procedure_intelligence.engine.schema import load_procedure_schema
from app.features.procedure_intelligence.engine.stability import StabilityScorer
from app.features.procedure_intelligence.engine.state_machine import (
    get_current_step_id,
    next_step,
    update_step,
)
from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.schemas.response import FrameResponse


_STABILITY_BY_SESSION: dict[str, StabilityScorer] = {}


def process_frame(request: FrameRequest, *, session_key: str | None = None) -> FrameResponse:
    # ✅ Merge: support both request landmarks AND camera fallback
    camera_runtime = get_camera_runtime()
    source_landmarks = request.landmarks if request.landmarks else camera_runtime.latest_landmarks()

    if not source_landmarks:
        return FrameResponse(
            step="step_1",
            valid=False,
            score=0.0,
            feedback=[],
            landmarks=[],
        )

    normalized = normalize_landmarks(source_landmarks)
    smoothed = smooth_landmarks(normalized)
    angles = compute_angles(smoothed)
    distances = compute_distances(smoothed)

    # 1) Determine current step/session context
    schema = load_procedure_schema(request.procedure_id)
    current_step_id = get_current_step_id(
        procedure_id=request.procedure_id, session_key=session_key
    )
    step_schema = schema.step_by_id()[current_step_id]

    # 2) Validate constraints
    validation = validate_step(step=step_schema, angles=angles, distances=distances)

    # 3) Update step state
    step_update = update_step(
        valid_constraints=validation.valid,
        procedure_id=request.procedure_id,
        session_key=session_key,
        timestamp_ms=request.timestamp_ms,
    )

    # 3b) Keep consistency
    step_now_schema = schema.step_by_id()[step_update.step_now]
    validation_now = validate_step(step=step_now_schema, angles=angles, distances=distances)

    # 4) Feedback
    feedback = generate_feedback(validation=validation, step_update=step_update)

    # 5) Stability scoring (session-based)
    key = session_key or request.procedure_id
    stability_scorer = _STABILITY_BY_SESSION.get(key)
    if stability_scorer is None:
        stability_scorer = StabilityScorer()
        _STABILITY_BY_SESSION[key] = stability_scorer

    stability = stability_scorer.update(
        angles=angles, distances=distances, timestamp_ms=request.timestamp_ms
    )

    score = compute_score(valid=validation_now.valid, stability=stability)

    return FrameResponse(
        step=step_update.step_now,
        valid=validation_now.valid,
        score=score,
        feedback=feedback,
        landmarks=source_landmarks,
    )