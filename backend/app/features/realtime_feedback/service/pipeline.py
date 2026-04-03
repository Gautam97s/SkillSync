from app.features.hand_tracking.cv.landmarks import normalize_landmarks
from app.features.hand_tracking.feature_engineering.angles import compute_angles
from app.features.hand_tracking.feature_engineering.distances import compute_distances
from app.features.hand_tracking.feature_engineering.smoothing import smooth_landmarks
from app.features.hand_tracking.service.camera_runtime import get_camera_runtime
from app.features.procedure_intelligence.engine.feedback import generate_feedback
from app.features.procedure_intelligence.engine.rules import validate_step
from app.features.procedure_intelligence.engine.scoring import compute_score
from app.features.procedure_intelligence.engine.state_machine import next_step
from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.schemas.response import FrameResponse


def process_frame(request: FrameRequest) -> FrameResponse:
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

    valid = validate_step(angles=angles, distances=distances)
    step = next_step(valid=valid)
    score = compute_score(valid=valid, angles=angles, distances=distances)
    feedback = generate_feedback(valid=valid, angles=angles, distances=distances)

    return FrameResponse(
        step=step,
        valid=valid,
        score=score,
        feedback=feedback,
        landmarks=source_landmarks,
    )
