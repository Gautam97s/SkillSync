from app.features.hand_tracking.cv.landmarks import normalize_landmarks
from app.features.hand_tracking.feature_engineering.angles import compute_angles
from app.features.hand_tracking.feature_engineering.distances import compute_distances
from app.features.hand_tracking.feature_engineering.smoothing import smooth_landmarks
from app.features.procedure_intelligence.engine.feedback import generate_feedback
from app.features.procedure_intelligence.engine.rules import validate_step
from app.features.procedure_intelligence.engine.scoring import compute_score
from app.features.procedure_intelligence.engine.state_machine import next_step
from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.schemas.response import FrameResponse


def process_frame(request: FrameRequest) -> FrameResponse:
    normalized = normalize_landmarks(request.landmarks)
    smoothed = smooth_landmarks(normalized)
    angles = compute_angles(smoothed)
    distances = compute_distances(smoothed)

    valid = validate_step(angles=angles, distances=distances)
    step = next_step(valid=valid)
    score = compute_score(valid=valid, angles=angles, distances=distances)
    feedback = generate_feedback(valid=valid, angles=angles, distances=distances)

    return FrameResponse(step=step, valid=valid, score=score, feedback=feedback)
