from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from statistics import mean, pstdev


@dataclass(frozen=True)
class _Snapshot:
    timestamp_ms: int
    values: tuple[float, ...]


class StabilityScorer:
    """
    Rolling-window stability score based on jitter in angles/distances over time.

    This is intentionally feature-based (angles/distances), not raw coordinate jitter.
    """

    def __init__(
        self,
        *,
        window_size: int = 20,
        min_samples: int = 6,
        idle_reset_ms: int = 5_000,
        cv_scale: float = 0.15,
        eps: float = 1e-6,
    ) -> None:
        self._window_size = int(window_size)
        self._min_samples = int(min_samples)
        self._idle_reset_ms = int(idle_reset_ms)
        self._cv_scale = float(cv_scale)
        self._eps = float(eps)

        self._feature_order: tuple[str, ...] | None = None
        self._history: deque[_Snapshot] = deque(maxlen=self._window_size)

    def reset(self) -> None:
        self._feature_order = None
        self._history.clear()

    def update(
        self,
        angles: dict[str, float],
        distances: dict[str, float],
        timestamp_ms: int,
    ) -> float:
        if self._history:
            last_t = self._history[-1].timestamp_ms
            if timestamp_ms < last_t or (timestamp_ms - last_t) > self._idle_reset_ms:
                self.reset()

        if self._feature_order is None:
            # Stable ordering to turn dicts into a consistent vector.
            self._feature_order = tuple(sorted(angles.keys()) + sorted(distances.keys()))

        values: list[float] = []
        for k in self._feature_order:
            if k in angles:
                values.append(float(angles[k]))
            elif k in distances:
                values.append(float(distances[k]))
            else:
                values.append(0.0)

        self._history.append(_Snapshot(timestamp_ms=int(timestamp_ms), values=tuple(values)))

        if len(self._history) < max(2, self._min_samples):
            return 1.0

        # Compute coefficient-of-variation (dimensionless) per feature over the window.
        by_dim = list(zip(*(s.values for s in self._history), strict=False))
        cvs: list[float] = []
        for series in by_dim:
            mu = mean(series)
            sigma = pstdev(series)
            cvs.append(float(sigma) / (abs(float(mu)) + self._eps))

        jitter = mean(cvs) if cvs else 0.0

        # Map jitter -> [0, 1]; higher jitter => lower stability.
        stability = 1.0 / (1.0 + (float(jitter) / max(self._cv_scale, self._eps)))
        if stability < 0.0:
            return 0.0
        if stability > 1.0:
            return 1.0
        return float(stability)

