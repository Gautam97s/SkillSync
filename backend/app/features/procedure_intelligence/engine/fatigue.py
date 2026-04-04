"""
Fatigue Detection Module (5.2)

Tracks session duration and stability trends to detect user fatigue.
Primary trigger: session running longer than 1 hour.
Secondary signals: declining stability, increasing error rate.
"""

import time
from collections import deque
from typing import Optional

from app.shared.models import FatigueAssessment, FatigueLevel


class FatigueDetector:
    """
    Monitors user fatigue over a training session.

    Primary rule: Session > 60 minutes triggers fatigue warning.
    Secondary signals: stability decline and error frequency.
    """

    def __init__(
        self,
        *,
        session_time_limit_minutes: float = 60.0,
        stability_window_size: int = 120,
        baseline_readings: int = 20,
        warmup_seconds: float = 30.0,
        fatigue_activation_start_minutes: float = 15.0,
        fatigue_activation_full_minutes: float = 20.0,
        score_smoothing_alpha: float = 0.08,
        min_score_update_interval_seconds: float = 0.75,
        max_score_step_per_interval: float = 0.015,
    ) -> None:
        # Time thresholds
        self._time_limit_minutes = session_time_limit_minutes

        # Session tracking
        self._session_start: Optional[float] = None
        self._last_break: Optional[float] = None

        # Stability history: (timestamp, score)
        self._stability_history: deque[tuple[float, float]] = deque(
            maxlen=stability_window_size
        )

        # Error history: (timestamp, had_error)
        self._error_history: deque[tuple[float, bool]] = deque(
            maxlen=stability_window_size
        )

        # Baseline
        self._baseline_scores: list[float] = []
        self._baseline_mean: Optional[float] = None
        self._baseline_readings = baseline_readings

        # Warmup
        self._warmup_seconds = warmup_seconds

        # Fatigue activation window (keeps score near-zero early in session)
        self._fatigue_activation_start_minutes = max(
            0.0, float(fatigue_activation_start_minutes)
        )
        self._fatigue_activation_full_minutes = max(
            self._fatigue_activation_start_minutes + 0.1,
            float(fatigue_activation_full_minutes),
        )

        # Score stabilization
        self._score_smoothing_alpha = max(0.01, min(1.0, score_smoothing_alpha))
        self._min_score_update_interval_seconds = max(
            0.1, float(min_score_update_interval_seconds)
        )
        self._max_score_step_per_interval = max(0.001, float(max_score_step_per_interval))
        self._last_score_update_ts: Optional[float] = None

        # Current state
        self._current_score: float = 0.0
        self._current_level: FatigueLevel = FatigueLevel.FRESH

    def start_session(self) -> None:
        """Call when a new practice session begins."""
        now = time.time()
        self._session_start = now
        self._last_break = now
        self._stability_history.clear()
        self._error_history.clear()
        self._baseline_scores.clear()
        self._baseline_mean = None
        self._current_score = 0.0
        self._current_level = FatigueLevel.FRESH
        self._last_score_update_ts = None

    def record_break(self) -> None:
        """Call when user takes a break."""
        self._last_break = time.time()
        self._current_score = max(0.0, self._current_score - 0.3)

    def update(
        self,
        stability_score: float,
        had_error: bool = False,
        timestamp: Optional[float] = None,
    ) -> FatigueAssessment:
        """
        Process a new reading and return fatigue assessment.

        Args:
            stability_score: 0.0 (unstable) to 1.0 (stable) from StabilityScorer
            had_error: Whether current frame failed validation
            timestamp: Optional timestamp (defaults to now)

        Returns:
            FatigueAssessment with level, score, and recommendations
        """
        now = timestamp or time.time()

        if self._session_start is None:
            self.start_session()
            self._session_start = now
            self._last_break = now

        # Record data
        self._stability_history.append((now, stability_score))
        self._error_history.append((now, had_error))

        # Build baseline from initial readings
        if len(self._baseline_scores) < self._baseline_readings:
            self._baseline_scores.append(stability_score)
            if len(self._baseline_scores) == self._baseline_readings:
                self._baseline_mean = sum(self._baseline_scores) / len(
                    self._baseline_scores
                )

        # Time calculations
        session_minutes = (now - self._session_start) / 60.0
        break_minutes = (now - self._last_break) / 60.0

        # During warmup, always return fresh
        elapsed = now - self._session_start
        if elapsed < self._warmup_seconds:
            return FatigueAssessment(
                fatigue_level=FatigueLevel.FRESH,
                fatigue_score=0.0,
                recommended_break_seconds=0,
                performance_degradation_pct=0.0,
                time_since_last_break_minutes=round(break_minutes, 1),
                warning_message=None,
            )

        # Compute fatigue signals
        time_fatigue = self._compute_time_fatigue(session_minutes)
        stability_fatigue = self._compute_stability_fatigue()
        error_fatigue = self._compute_error_fatigue()
        degradation = self._compute_degradation()

        # Combine signals
        fatigue_score = self._combine_signals(
            time_fatigue=time_fatigue,
            stability_fatigue=stability_fatigue,
            error_fatigue=error_fatigue,
            degradation=degradation,
        )

        # Ramp fatigue contribution from 15 to 20 minutes.
        fatigue_score *= self._activation_factor(session_minutes)

        # Smooth with previous score and rate-limit changes so score remains steady.
        # The detector may run at camera FPS; this keeps score movement gradual.
        alpha = self._score_smoothing_alpha
        smoothed = alpha * fatigue_score + (1.0 - alpha) * self._current_score

        if self._last_score_update_ts is None:
            self._current_score = max(0.0, min(1.0, smoothed))
            self._last_score_update_ts = now
        else:
            elapsed_since_update = now - self._last_score_update_ts
            if elapsed_since_update >= self._min_score_update_interval_seconds:
                scale = max(
                    1.0,
                    elapsed_since_update / self._min_score_update_interval_seconds,
                )
                allowed_step = self._max_score_step_per_interval * scale
                delta = smoothed - self._current_score
                if delta > allowed_step:
                    delta = allowed_step
                elif delta < -allowed_step:
                    delta = -allowed_step
                self._current_score = max(0.0, min(1.0, self._current_score + delta))
                self._last_score_update_ts = now

        # Classify
        self._current_level = self._classify(self._current_score)

        # Build response
        break_seconds = self._recommend_break(self._current_level)
        warning = self._generate_warning(
            self._current_level, session_minutes, degradation
        )

        return FatigueAssessment(
            fatigue_level=self._current_level,
            fatigue_score=round(self._current_score, 3),
            recommended_break_seconds=break_seconds,
            performance_degradation_pct=round(degradation, 1),
            time_since_last_break_minutes=round(break_minutes, 1),
            warning_message=warning,
        )

    def _compute_time_fatigue(self, session_minutes: float) -> float:
        """
        Primary fatigue signal based on session duration.

        0-30 min: 0.0 (fresh)
        30-45 min: 0.0-0.3 (building)
        45-60 min: 0.3-0.6 (moderate)
        60+ min: 0.6-1.0 (high to critical)
        """
        if session_minutes <= 30.0:
            return 0.0
        elif session_minutes <= 45.0:
            return 0.3 * ((session_minutes - 30.0) / 15.0)
        elif session_minutes <= 60.0:
            return 0.3 + 0.3 * ((session_minutes - 45.0) / 15.0)
        elif session_minutes <= 90.0:
            return 0.6 + 0.4 * ((session_minutes - 60.0) / 30.0)
        else:
            return 1.0

    def _activation_factor(self, session_minutes: float) -> float:
        """
        Return a 0..1 multiplier for fatigue score based on session age.

        - <= activation start: 0.0
        - activation start..activation full: linear ramp to 1.0
        - >= activation full: 1.0
        """
        if session_minutes <= self._fatigue_activation_start_minutes:
            return 0.0
        if session_minutes >= self._fatigue_activation_full_minutes:
            return 1.0

        span = (
            self._fatigue_activation_full_minutes
            - self._fatigue_activation_start_minutes
        )
        return max(
            0.0,
            min(
                1.0,
                (session_minutes - self._fatigue_activation_start_minutes) / span,
            ),
        )

    def _compute_stability_fatigue(self) -> float:
        """Fatigue signal from average stability. Low stability = high fatigue."""
        if not self._stability_history:
            return 0.0

        scores = [s for _, s in self._stability_history]
        avg = sum(scores) / len(scores)
        return max(0.0, min(1.0, 1.0 - avg))

    def _compute_error_fatigue(self) -> float:
        """Fatigue signal from error rate."""
        if not self._error_history:
            return 0.0

        errors = [e for _, e in self._error_history]
        rate = sum(1 for e in errors if e) / len(errors)
        return rate

    def _compute_degradation(self) -> float:
        """Performance degradation percentage from baseline."""
        if self._baseline_mean is None or self._baseline_mean == 0:
            return 0.0

        if not self._stability_history:
            return 0.0

        # Use last 20 readings for current performance
        recent = [s for _, s in self._stability_history][-20:]
        current_avg = sum(recent) / len(recent)

        degradation = (self._baseline_mean - current_avg) / self._baseline_mean
        return max(0.0, min(100.0, degradation * 100.0))

    def _combine_signals(
        self,
        *,
        time_fatigue: float,
        stability_fatigue: float,
        error_fatigue: float,
        degradation: float,
    ) -> float:
        """
        Combine all signals into a single fatigue score.

        Time is the primary signal (40%) since the requirement
        is fatigue after 1 hour.
        """
        degradation_normalized = degradation / 100.0

        return (
            0.40 * time_fatigue
            + 0.25 * stability_fatigue
            + 0.15 * error_fatigue
            + 0.20 * degradation_normalized
        )

    def _classify(self, score: float) -> FatigueLevel:
        """Map score to fatigue level."""
        if score < 0.15:
            return FatigueLevel.FRESH
        elif score < 0.35:
            return FatigueLevel.MILD
        elif score < 0.55:
            return FatigueLevel.MODERATE
        elif score < 0.75:
            return FatigueLevel.HIGH
        else:
            return FatigueLevel.CRITICAL

    def _recommend_break(self, level: FatigueLevel) -> int:
        """Recommend break duration in seconds."""
        breaks = {
            FatigueLevel.FRESH: 0,
            FatigueLevel.MILD: 30,
            FatigueLevel.MODERATE: 60,
            FatigueLevel.HIGH: 120,
            FatigueLevel.CRITICAL: 300,
        }
        return breaks.get(level, 0)

    def _generate_warning(
        self,
        level: FatigueLevel,
        session_minutes: float,
        degradation: float,
    ) -> Optional[str]:
        """Generate human-readable warning message."""
        if level == FatigueLevel.FRESH:
            return None

        minutes_str = f"{session_minutes:.0f}"

        if level == FatigueLevel.MILD:
            return (
                f"Session running for {minutes_str} minutes. "
                f"Mild fatigue detected. Consider a short break soon."
            )
        elif level == FatigueLevel.MODERATE:
            return (
                f"Session running for {minutes_str} minutes. "
                f"Performance down {degradation:.0f}%. "
                f"A 1-minute break is recommended."
            )
        elif level == FatigueLevel.HIGH:
            return (
                f"Session running for {minutes_str} minutes. "
                f"Performance degraded by {degradation:.0f}%. "
                f"Please take a 2-minute break to maintain accuracy."
            )
        else:
            return (
                f"CRITICAL: Session has been running for {minutes_str} minutes. "
                f"Performance degraded by {degradation:.0f}%. "
                f"Stop and rest for at least 5 minutes."
            )

    @property
    def current_level(self) -> FatigueLevel:
        return self._current_level

    @property
    def current_score(self) -> float:
        return self._current_score

    @property
    def session_minutes(self) -> float:
        if self._session_start is None:
            return 0.0
        return (time.time() - self._session_start) / 60.0