from __future__ import annotations

import pytest

from app.features.hand_tracking.feature_engineering.angles import compute_angles
from app.features.hand_tracking.feature_engineering.distances import compute_distances
from app.features.hand_tracking.feature_engineering.occlusion import JointOcclusionEstimator
from app.features.procedure_intelligence.engine.feedback import generate_feedback
from app.features.procedure_intelligence.engine.rules import validate_step
from app.features.procedure_intelligence.engine.schema import LoadSchemaError, load_procedure_schema
from app.features.procedure_intelligence.engine.scoring import compute_score
from app.features.procedure_intelligence.engine.stability import StabilityScorer
from app.features.procedure_intelligence.engine import state_machine
from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.service import pipeline


@pytest.fixture(autouse=True)
def _clear_session_state() -> None:
    state_machine.SESSIONS.clear()
    pipeline._STABILITY_BY_SESSION.clear()
    pipeline._METRIC_HISTORY.clear()
    pipeline._JOINT_OCCLUSION_BY_SESSION.clear()
    pipeline._FATIGUE_BY_SESSION.clear()


class _StubCameraRuntime:
    def latest_landmarks(self) -> list[list[float]]:
        return []


def _sample_landmarks(offset: float = 0.0) -> list[list[float]]:
    return [[(i * 0.01) + offset, (i * 0.01) + offset, 0.0] for i in range(21)]


def _first_step_schema():
    schema = load_procedure_schema("surgical_knot_tying")
    return schema, schema.steps[0]


def _valid_metrics_for_step(step_id: str) -> tuple[dict[str, float], dict[str, float]]:
    if step_id == "thumb_index_precision_grip":
        return ({"wrist_index_angle": 90.0}, {"thumb_index_over_palm": 0.2})
    if step_id == "middle_finger_support":
        return (
            {"index_middle_alignment": 40.0, "wrist_index_angle": 90.0},
            {"index_middle_over_palm": 0.3, "middle_below_index": 1.0},
        )
    if step_id == "initial_incision_position":
        return ({"wrist_index_angle": 90.0}, {})
    if step_id == "cutting_angle_control":
        return ({"wrist_index_angle": 45.0}, {})
    if step_id == "grip_stability":
        return (
            {"wrist_index_angle": 45.0},
            {
                "thumb_index_over_palm": 0.2,
                "index_middle_over_palm": 0.3,
                "middle_below_index": 1.0,
            },
        )
    return ({}, {})


def test_schema_loads_with_expected_steps() -> None:
    schema = load_procedure_schema("surgical_knot_tying")

    assert schema.procedure_id == "surgical_knot_tying"
    assert len(schema.steps) == 6
    assert schema.steps[0].id == "thumb_index_precision_grip"
    assert schema.steps[-1].id == "completed"


def test_unknown_schema_raises_error() -> None:
    with pytest.raises(LoadSchemaError):
        load_procedure_schema("does_not_exist")


def test_compute_angles_returns_zero_defaults_for_short_input() -> None:
    angles = compute_angles([])

    assert angles["mcp_joint"] == 0.0
    assert angles["pip_joint"] == 0.0
    assert angles["wrist_index_angle"] == 0.0


def test_compute_distances_returns_zero_defaults_for_short_input() -> None:
    distances = compute_distances([])

    assert distances["thumb_index_distance"] == 0.0
    assert distances["index_middle_distance"] == 0.0
    assert distances["thumb_index_over_palm"] == 0.0


def test_first_step_validation_passes_with_valid_metrics() -> None:
    _, step = _first_step_schema()
    angles, distances = _valid_metrics_for_step(step.id)

    result = validate_step(step=step, angles=angles, distances=distances, scalars=distances)

    assert result.valid is True
    assert result.violations == []


def test_first_step_validation_fails_with_out_of_range_metric() -> None:
    _, step = _first_step_schema()
    result = validate_step(
        step=step,
        angles={},
        distances={"thumb_index_over_palm": 0.9},
        scalars={},
    )

    assert result.valid is False
    assert len(result.violations) >= 1
    assert result.violations[0]["constraint_key"] == "thumb_index_over_palm"


def test_feedback_uses_plain_language_on_violation() -> None:
    validation = validate_step(
        step=load_procedure_schema("surgical_knot_tying").step_by_id()["thumb_index_precision_grip"],
        angles={},
        distances={"thumb_index_over_palm": 0.9},
        scalars={},
    )
    step_update = state_machine.StepUpdate(
        step_started="thumb_index_precision_grip",
        step_now="thumb_index_precision_grip",
        advanced=False,
        step_valid_since_ms=None,
        dwell_remaining_ms=0,
        completed=False,
        reset=False,
    )

    feedback = generate_feedback(validation=validation, step_update=step_update)

    assert feedback
    assert "closer" in feedback[0].message.lower()


def test_feedback_reports_hold_time_in_seconds() -> None:
    validation = state_machine.StepUpdate(
        step_started="thumb_index_precision_grip",
        step_now="thumb_index_precision_grip",
        advanced=False,
        step_valid_since_ms=1000,
        dwell_remaining_ms=1300,
        completed=False,
        reset=False,
    )
    ok = type("OkValidation", (), {"valid": True, "violations": []})()

    feedback = generate_feedback(validation=ok, step_update=validation)

    assert feedback
    assert "second" in feedback[0].message.lower()


def test_state_machine_advances_after_two_second_hold() -> None:
    session_key = "test_hold"
    start = state_machine.get_current_step_id(session_key=session_key)

    first = state_machine.update_step(
        session_key=session_key,
        valid_constraints=True,
        timestamp_ms=1000,
    )
    second = state_machine.update_step(
        session_key=session_key,
        valid_constraints=True,
        timestamp_ms=3100,
    )

    assert start == "thumb_index_precision_grip"
    assert first.step_now == "thumb_index_precision_grip"
    assert second.step_now == "middle_finger_support"
    assert second.advanced is True


def test_state_machine_resets_when_mcp_out_of_range_for_three_seconds() -> None:
    session_key = "test_reset"
    state_machine.SESSIONS[session_key] = state_machine.SessionState(
        current_step_id="cutting_angle_control"
    )

    first = state_machine.update_step(
        session_key=session_key,
        valid_constraints=True,
        mcp_in_range=False,
        timestamp_ms=1000,
    )
    second = state_machine.update_step(
        session_key=session_key,
        valid_constraints=True,
        mcp_in_range=False,
        timestamp_ms=4101,
    )

    assert first.reset is False
    assert second.reset is True
    assert second.step_now == "thumb_index_precision_grip"


def test_compute_score_clamps_and_penalizes_invalid() -> None:
    assert compute_score(valid=True, stability=1.4) == 1.0
    assert compute_score(valid=True, stability=-1.0) == 0.0
    assert compute_score(valid=False, stability=0.8) == pytest.approx(0.2)


def test_stability_scorer_returns_bounded_values() -> None:
    scorer = StabilityScorer(window_size=8, min_samples=3)

    values = []
    for i in range(1, 9):
        score = scorer.update(
            angles={"wrist_index_angle": 45.0 + (0.2 * i)},
            distances={"thumb_index_over_palm": 0.2 + (0.001 * i)},
            timestamp_ms=1000 + i,
        )
        values.append(score)

    assert all(0.0 <= s <= 1.0 for s in values)


def test_joint_occlusion_estimator_predicts_after_observation() -> None:
    estimator = JointOcclusionEstimator(timeout_ms=2000)
    observed = _sample_landmarks()

    first = estimator.observe(observed, timestamp_ms=1000)
    predicted = estimator.predict(timestamp_ms=1500)

    assert first.estimated is False
    assert first.expired is False
    assert first.avg_confidence == 1.0
    assert predicted.estimated is True
    assert predicted.expired is False
    assert len(predicted.landmarks) == 21
    assert all(0.0 <= point[0] <= 1.0 for point in predicted.landmarks)
    assert all(0.0 <= point[1] <= 1.0 for point in predicted.landmarks)
    assert all(-0.6 <= point[2] <= 0.6 for point in predicted.landmarks)
    assert all(0.0 < value <= 1.0 for value in predicted.joint_confidence.values())


def test_joint_occlusion_estimator_expires_after_timeout() -> None:
    estimator = JointOcclusionEstimator(timeout_ms=1000)
    estimator.observe(_sample_landmarks(), timestamp_ms=1000)

    expired = estimator.predict(timestamp_ms=2200)

    assert expired.expired is True
    assert expired.landmarks == []
    assert all(value == 0.0 for value in expired.joint_confidence.values())


def test_pipeline_uses_predicted_landmarks_during_short_occlusion(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "get_camera_runtime", lambda: _StubCameraRuntime())

    session_key = "occlusion_case"

    first = pipeline.process_frame(
        FrameRequest(
            frame_id=1,
            timestamp_ms=1000,
            landmarks=_sample_landmarks(),
            procedure_id="surgical_knot_tying",
        ),
        session_key=session_key,
    )
    second = pipeline.process_frame(
        FrameRequest(
            frame_id=2,
            timestamp_ms=1600,
            landmarks=[],
            procedure_id="surgical_knot_tying",
        ),
        session_key=session_key,
    )

    assert first.reset is False
    assert len(first.landmarks) == 21
    assert first.landmarks_estimated is False
    assert second.reset is False
    assert len(second.landmarks) == 21
    assert second.landmarks_estimated is True
    assert second.joint_confidence
    assert any(value < 1.0 for value in second.joint_confidence.values())


def test_pipeline_resets_after_prolonged_occlusion(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "get_camera_runtime", lambda: _StubCameraRuntime())

    session_key = "occlusion_timeout_case"

    pipeline.process_frame(
        FrameRequest(
            frame_id=1,
            timestamp_ms=1000,
            landmarks=_sample_landmarks(),
            procedure_id="surgical_knot_tying",
        ),
        session_key=session_key,
    )

    response = pipeline.process_frame(
        FrameRequest(
            frame_id=2,
            timestamp_ms=5000,
            landmarks=[],
            procedure_id="surgical_knot_tying",
        ),
        session_key=session_key,
    )

    assert response.reset is True
    assert response.score == 0.0
    assert response.landmarks == []
    assert response.angles is not None
    assert response.distances is not None
    assert all(v == 0.0 for v in response.angles.values())
    assert all(v == 0.0 for v in response.distances.values())
    assert all(v == 0.0 for v in response.joint_confidence.values())
