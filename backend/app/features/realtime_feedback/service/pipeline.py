from app.features.procedure_intelligence.engine.fatigue import FatigueDetector
from app.features.realtime_feedback.schemas.response import FatigueInfo
from app.features.hand_tracking.cv.landmarks import normalize_landmarks
from app.features.hand_tracking.feature_engineering.angles import compute_angles
from app.features.hand_tracking.feature_engineering.distances import compute_distances
from app.features.hand_tracking.feature_engineering.occlusion import JointOcclusionEstimator
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
    reset_session,
    update_step,
)
from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.schemas.response import FrameResponse, StepInfo


_STABILITY_BY_SESSION: dict[str, StabilityScorer] = {}
_METRIC_HISTORY: dict[str, dict[str, dict[str, float]]] = {}
_JOINT_OCCLUSION_BY_SESSION: dict[str, JointOcclusionEstimator] = {}

_FATIGUE_BY_SESSION: dict[str, FatigueDetector] = {}

_ZERO_ANGLES: dict[str, float] = {
    "thumb_index_angle": 0.0,
    "wrist_finger_angle": 0.0,
    "mcp_joint": 0.0,
    "pip_joint": 0.0,
    "wrist_index_angle": 0.0,
    "index_middle_alignment": 0.0,
}

_ZERO_DISTANCES: dict[str, float] = {
    "thumb_index_distance": 0.0,
    "index_middle_distance": 0.0,
    "palm_width": 0.0,
    "thumb_index_over_palm": 0.0,
    "index_middle_over_palm": 0.0,
    "middle_below_index": 0.0,
}
  
def _smooth_metric_map(
    *,
    key: str,
    metric_name: str,
    values: dict[str, float],
    alpha: float = 0.3,
) -> dict[str, float]:
    session_metrics = _METRIC_HISTORY.setdefault(key, {})
    previous = session_metrics.get(metric_name)
    if previous is None or previous.keys() != values.keys():
        smoothed = {name: float(value) for name, value in values.items()}
    else:
        beta = 1.0 - float(alpha)
        smoothed = {
            name: (float(alpha) * float(value)) + (beta * float(previous[name]))
            for name, value in values.items()
        }
    session_metrics[metric_name] = smoothed
    return smoothed


def process_frame(request: FrameRequest, *, session_key: str | None = None) -> FrameResponse:
    # ✅ Merge: support both request landmarks AND camera fallback
    camera_runtime = get_camera_runtime()
    source_landmarks = request.landmarks if request.landmarks else camera_runtime.latest_landmarks()

    metric_key = session_key or request.procedure_id
    estimator = _JOINT_OCCLUSION_BY_SESSION.get(metric_key)
    if estimator is None:
        estimator = JointOcclusionEstimator()
        _JOINT_OCCLUSION_BY_SESSION[metric_key] = estimator

    joint_confidence: dict[str, float] = {}
    landmarks_estimated = False

    if not source_landmarks:
# --- Estimation + fallback handling ---
estimate = estimator.predict(timestamp_ms=request.timestamp_ms)

if estimate.expired or not estimate.landmarks:
    reset_session(procedure_id=request.procedure_id, session_key=session_key)

    # Keep difficulty support (samarth) + estimator metadata (dev)
    schema = load_procedure_schema(
        request.procedure_id,
        difficulty=getattr(request, "difficulty", None),
    )

    procedure_steps = [
        StepInfo(id=step.id, dwell_time_ms=step.dwell_time_ms)
        for step in schema.steps
    ]

    return FrameResponse(
        step=schema.steps[0].id,
        valid=False,
        score=0.0,
        feedback=[],
        landmarks=[],
        joint_confidence=dict(estimate.joint_confidence),
        landmarks_estimated=bool(estimate.estimated),
        angles=dict(_ZERO_ANGLES),
        distances=dict(_ZERO_DISTANCES),
        procedure_steps=procedure_steps,
        reset=True,
        difficulty=getattr(request, "difficulty", None),
    )

# --- Normal flow ---
source_landmarks = estimate.landmarks
joint_confidence = dict(estimate.joint_confidence)
landmarks_estimated = bool(estimate.estimated)
    normalized = normalize_landmarks(source_landmarks)
    smoothed = smooth_landmarks(normalized, session_key=session_key)
    angles = compute_angles(smoothed)
    distances = compute_distances(smoothed)

    angles = _smooth_metric_map(key=metric_key, metric_name="angles", values=angles)
    distances = _smooth_metric_map(key=metric_key, metric_name="distances", values=distances)

    # 1) Determine current step/session context
    schema = load_procedure_schema(request.procedure_id, difficulty=request.difficulty)
    current_step_id = get_current_step_id(
        procedure_id=request.procedure_id, session_key=session_key
    )
    step_schema = schema.step_by_id()[current_step_id]

    # 2) Validate constraints
    validation = validate_step(
        step=step_schema,
        angles=angles,
        distances=distances,
        scalars=distances,
    )

    # Determine MCP in-range against the procedure's MCP constraint (if any).
    # Prefer the hold_steady range; fallback to current step; fallback to "in range".
    mcp_constraint = None
    hold_steady = schema.step_by_id().get("hold_steady")
    if hold_steady is not None:
        mcp_constraint = hold_steady.constraints.angles.get("mcp_joint")
    if mcp_constraint is None:
        mcp_constraint = step_schema.constraints.angles.get("mcp_joint")

    mcp_in_range: bool | None = None
    if mcp_constraint is not None:
        mcp_value = float(angles.get("mcp_joint", 0.0))
        mcp_in_range = float(mcp_constraint.min) <= mcp_value <= float(mcp_constraint.max)

    # 3) Update step state
    step_update = update_step(
        valid_constraints=validation.valid,
        mcp_in_range=mcp_in_range,
        procedure_id=request.procedure_id,
        session_key=session_key,
        timestamp_ms=request.timestamp_ms,
    )

    # 3b) Keep consistency
    step_now_schema = schema.step_by_id()[step_update.step_now]
    validation_now = validate_step(
        step=step_now_schema,
        angles=angles,
        distances=distances,
        scalars=distances,
    )

    # 4) Feedback
    feedback = generate_feedback(validation=validation, step_update=step_update)

    # 5) Stability scoring (session-based)
    key = metric_key
    stability_scorer = _STABILITY_BY_SESSION.get(key)
    if stability_scorer is None:
        stability_scorer = StabilityScorer()
        _STABILITY_BY_SESSION[key] = stability_scorer

    stability = stability_scorer.update(
        angles=angles, distances=distances, timestamp_ms=request.timestamp_ms
    )

    score = compute_score(valid=validation_now.valid, stability=stability)

    # Convert schema steps to StepInfo objects
    procedure_steps = [
        StepInfo(id=step.id, dwell_time_ms=step.dwell_time_ms) for step in schema.steps
    ]

        # 6) Fatigue detection
    fatigue_key = session_key or request.procedure_id
    fatigue_detector = _FATIGUE_BY_SESSION.get(fatigue_key)
    if fatigue_detector is None:
        fatigue_detector = FatigueDetector()
        fatigue_detector.start_session()
        _FATIGUE_BY_SESSION[fatigue_key] = fatigue_detector

    fatigue_assessment = fatigue_detector.update(
        stability_score=stability,
        had_error=not validation_now.valid,
    )

    fatigue_info = FatigueInfo(
        fatigue_level=fatigue_assessment.fatigue_level.value,
        fatigue_score=fatigue_assessment.fatigue_score,
        recommended_break_seconds=fatigue_assessment.recommended_break_seconds,
        session_minutes=round(fatigue_detector.session_minutes, 1),
        warning_message=fatigue_assessment.warning_message,
    )

    return FrameResponse(
        step=step_update.step_now,
        valid=validation_now.valid,
        score=score,
        feedback=feedback,
        landmarks=source_landmarks,
        joint_confidence=joint_confidence,
        landmarks_estimated=landmarks_estimated,
        angles=angles,
        distances=distances,
        procedure_steps=procedure_steps,
        reset=bool(step_update.reset),
difficulty=request.difficulty,
fatigue=fatigue_info,
    )