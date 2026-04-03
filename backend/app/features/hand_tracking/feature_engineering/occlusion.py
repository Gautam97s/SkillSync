from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Final
import math

LANDMARK_NAMES: Final[tuple[str, ...]] = (
    "wrist",
    "thumb_cmc",
    "thumb_mcp",
    "thumb_ip",
    "thumb_tip",
    "index_mcp",
    "index_pip",
    "index_dip",
    "index_tip",
    "middle_mcp",
    "middle_pip",
    "middle_dip",
    "middle_tip",
    "ring_mcp",
    "ring_pip",
    "ring_dip",
    "ring_tip",
    "pinky_mcp",
    "pinky_pip",
    "pinky_dip",
    "pinky_tip",
)

# Distal joints are naturally harder to predict when the hand is occluded.
JOINT_BASE_CONFIDENCE: Final[tuple[float, ...]] = (
    1.00,
    0.96,
    0.95,
    0.90,
    0.82,
    0.96,
    0.92,
    0.88,
    0.80,
    0.96,
    0.92,
    0.88,
    0.80,
    0.96,
    0.92,
    0.88,
    0.80,
    0.96,
    0.92,
    0.88,
    0.80,
)


@dataclass(frozen=True)
class OcclusionEstimate:
    landmarks: list[list[float]]
    joint_confidence: dict[str, float]
    estimated: bool
    expired: bool
    avg_confidence: float


@dataclass(frozen=True)
class _Snapshot:
    timestamp_ms: int
    landmarks: tuple[tuple[float, float, float], ...]


def _copy_landmarks(landmarks: list[list[float]]) -> list[list[float]]:
    return [[float(x), float(y), float(z)] for x, y, z in landmarks]


def _euclidean_3d(a: list[float], b: list[float]) -> float:
    return math.sqrt(
        ((a[0] - b[0]) ** 2) +
        ((a[1] - b[1]) ** 2) +
        ((a[2] - b[2]) ** 2)
    )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, float(value)))


def _zero_confidence_map() -> dict[str, float]:
    return {name: 0.0 for name in LANDMARK_NAMES}


def _confidence_map_from_score(score: float) -> dict[str, float]:
    return {
        name: round(max(0.0, min(1.0, score * weight)), 4)
        for name, weight in zip(LANDMARK_NAMES, JOINT_BASE_CONFIDENCE, strict=False)
    }


class JointOcclusionEstimator:
    """
    Lightweight per-session estimator that predicts hidden hand joints from the last
    known motion pattern when the camera temporarily loses the hand.
    """

    def __init__(
        self,
        *,
        history_size: int = 6,
        timeout_ms: int = 2500,
        confidence_floor: float = 0.08,
        velocity_decay: float = 0.88,
    ) -> None:
        self._history: deque[_Snapshot] = deque(maxlen=max(2, int(history_size)))
        self._last_observed: list[list[float]] | None = None
        self._last_velocity: list[list[float]] | None = None
        self._last_seen_ms: int | None = None
        self._occluded_since_ms: int | None = None
        self._timeout_ms = max(250, int(timeout_ms))
        self._confidence_floor = float(confidence_floor)
        self._velocity_decay = float(velocity_decay)

    def reset(self) -> None:
        self._history.clear()
        self._last_observed = None
        self._last_velocity = None
        self._last_seen_ms = None
        self._occluded_since_ms = None

    def observe(self, landmarks: list[list[float]], *, timestamp_ms: int) -> OcclusionEstimate:
        copied = _copy_landmarks(landmarks)
        if len(copied) != len(LANDMARK_NAMES):
            # Keep the estimator safe; if the frame is malformed, treat it as missing.
            return self.predict(timestamp_ms=timestamp_ms)

        if self._last_observed is not None and self._last_seen_ms is not None:
            dt_ms = max(1, int(timestamp_ms) - int(self._last_seen_ms))
            dt_s = float(dt_ms) / 1000.0
            velocities: list[list[float]] = []
            for idx, point in enumerate(copied):
                prev_point = self._last_observed[idx]
                velocities.append(
                    [
                        (point[0] - prev_point[0]) / dt_s,
                        (point[1] - prev_point[1]) / dt_s,
                        (point[2] - prev_point[2]) / dt_s,
                    ]
                )
            if self._last_velocity is None:
                self._last_velocity = velocities
            else:
                blend = 0.55
                self._last_velocity = [
                    [
                        (blend * new_vel[0]) + ((1.0 - blend) * old_vel[0]),
                        (blend * new_vel[1]) + ((1.0 - blend) * old_vel[1]),
                        (blend * new_vel[2]) + ((1.0 - blend) * old_vel[2]),
                    ]
                    for new_vel, old_vel in zip(velocities, self._last_velocity, strict=False)
                ]
        else:
            self._last_velocity = [[0.0, 0.0, 0.0] for _ in copied]

        self._last_observed = copied
        self._last_seen_ms = int(timestamp_ms)
        self._occluded_since_ms = None
        self._history.append(
            _Snapshot(
                timestamp_ms=int(timestamp_ms),
                landmarks=tuple((float(x), float(y), float(z)) for x, y, z in copied),
            )
        )

        return OcclusionEstimate(
            landmarks=copied,
            joint_confidence={name: 1.0 for name in LANDMARK_NAMES},
            estimated=False,
            expired=False,
            avg_confidence=1.0,
        )

    def predict(self, *, timestamp_ms: int) -> OcclusionEstimate:
        if self._last_observed is None or self._last_seen_ms is None:
            return OcclusionEstimate(
                landmarks=[],
                joint_confidence=_zero_confidence_map(),
                estimated=True,
                expired=False,
                avg_confidence=0.0,
            )

        if self._occluded_since_ms is None:
            self._occluded_since_ms = int(self._last_seen_ms)

        elapsed_since_seen_ms = max(0, int(timestamp_ms) - int(self._last_seen_ms))
        if elapsed_since_seen_ms >= self._timeout_ms:
            self.reset()
            return OcclusionEstimate(
                landmarks=[],
                joint_confidence=_zero_confidence_map(),
                estimated=True,
                expired=True,
                avg_confidence=0.0,
            )

        elapsed_s = float(elapsed_since_seen_ms) / 1000.0
        decay = math.exp(-elapsed_s * (1.0 - self._velocity_decay))
        horizon = max(0.0, 1.0 - (elapsed_since_seen_ms / float(self._timeout_ms)))

        palm_width = _euclidean_3d(self._last_observed[5], self._last_observed[17])
        base_shift = _clamp(palm_width * 0.65, 0.03, 0.22)
        allowed_shift = base_shift * max(0.35, horizon)

        global_confidence = max(self._confidence_floor, horizon * decay)

        predicted: list[list[float]] = []
        for idx, point in enumerate(self._last_observed):
            velocity = self._last_velocity[idx] if self._last_velocity is not None else [0.0, 0.0, 0.0]

            dx = velocity[0] * elapsed_s * decay
            dy = velocity[1] * elapsed_s * decay
            dz = velocity[2] * elapsed_s * decay
            displacement = math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
            if displacement > allowed_shift and displacement > 1e-9:
                scale = allowed_shift / displacement
                dx *= scale
                dy *= scale
                dz *= scale

            predicted.append(
                [
                    _clamp(point[0] + dx, 0.0, 1.0),
                    _clamp(point[1] + dy, 0.0, 1.0),
                    _clamp(point[2] + dz, -0.6, 0.6),
                ]
            )

        confidence_map = _confidence_map_from_score(global_confidence)
        avg_confidence = sum(confidence_map.values()) / max(1, len(confidence_map))
        self._history.append(
            _Snapshot(
                timestamp_ms=int(timestamp_ms),
                landmarks=tuple((float(x), float(y), float(z)) for x, y, z in predicted),
            )
        )
        return OcclusionEstimate(
            landmarks=predicted,
            joint_confidence=confidence_map,
            estimated=True,
            expired=False,
            avg_confidence=float(avg_confidence),
        )
