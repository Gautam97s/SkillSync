"""
Fatigue Detection Module (5.2)

Tracks session duration and stability trends to detect user fatigue.

Rules:
- Time-based fatigue increases as session duration grows.
- Jitter is checked at dynamic checkpoints:
    0-60 min   -> every 5 min
    60-90 min  -> every 3 min
    90-120 min -> every 2 min
    120+ min   -> every 1 min
- If high jitter is detected at a checkpoint, fatigue escalates faster.
"""

import time
from collections import deque
from typing import Optional

from app.shared.models import FatigueAssessment, FatigueLevel


class FatigueDetector:
    def __init__(
        self,
        *,
        session_time_limit_minutes: float = 60.0,
        stability_window_size: int = 120,
        baseline_readings: int = 20,
        warmup_seconds: float = 30.0,
    ) -> None:
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

        # Baseline stability
        self._baseline_scores: list[float] = []
        self._baseline_mean: Optional[float] = None
        self._baseline_readings = baseline_readings

        # Warmup period
        self._warmup_seconds = warmup_seconds

        # Jitter checkpoint tracking
        self._last_checkpoint_minutes: float = 0.0
        self._jitter_triggered: bool = False
        self._jitter_trigger_minute: Optional[float] = None
        self._jitter_threshold: float = 0.4  # low stability => high jitter

        # Current fatigue state
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
        self._last_checkpoint_minutes = 0.0
        self._jitter_triggered = False
        self._jitter_trigger_minute = None
        self._current_score = 0.0
        self._current_level = FatigueLevel.FRESH

    def record_break(self) -> None:
        """Call when user takes a break."""
        self._last_break = time.time()
        self._current_score = max(0.0, self._current_score - 0.3)
        self._jitter_triggered = False
        self._jitter_trigger_minute = None

    def update(
        self,
        stability_score: float,
        had_error: bool = False,
        timestamp: Optional[float] = None,
    ) -> FatigueAssessment:
        now = timestamp or time.time()

        if self._session_start is None:
            self.start_session()
            self._session_start = now
            self._last_break = now

        # Record current readings
        self._stability_history.append((now, stability_score))
        self._error_history.append((now, had_error))

        # Build baseline using early stable readings
        if len(self._baseline_scores) < self._baseline_readings:
            self._baseline_scores.append(stability_score)
            if len(self._baseline_scores) == self._baseline_readings:
                self._baseline_mean = sum(self._baseline_scores) / len(self._baseline_scores)

        # Time calculations
        session_minutes = (now - self._session_start) / 60.0
        break_minutes = (now - self._last_break) / 60.0

        # Check jitter only at dynamic checkpoints
        self._check_jitter_at_checkpoint(session_minutes)

        # Warmup period
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

        fatigue_score = self._combine_signals(
            time_fatigue=time_fatigue,
            stability_fatigue=stability_fatigue,
            error_fatigue=error_fatigue,
            degradation=degradation,
        )

        # Smooth output
        alpha = 0.3
        smoothed = alpha * fatigue_score + (1.0 - alpha) * self._current_score
        self._current_score = max(0.0, min(1.0, smoothed))

        self._current_level = self._classify(self._current_score)

        return FatigueAssessment(
            fatigue_level=self._current_level,
            fatigue_score=round(self._current_score, 3),
            recommended_break_seconds=self._recommend_break(self._current_level),
            performance_degradation_pct=round(degradation, 1),
            time_since_last_break_minutes=round(break_minutes, 1),
            warning_message=self._generate_warning(
                self._current_level, session_minutes, degradation
            ),
        )

    def _get_checkpoint_interval(self, session_minutes: float) -> float:
        """
        Checkpoint interval decreases as session gets longer.
        """
        if session_minutes < 60.0:
            return 5.0
        elif session_minutes < 90.0:
            return 3.0
        elif session_minutes < 120.0:
            return 2.0
        else:
            return 1.0

    def _check_jitter_at_checkpoint(self, session_minutes: float) -> None:
        """
        At each dynamic checkpoint, check whether stability is too low.
        Low stability implies high jitter.
        """
        interval = self._get_checkpoint_interval(session_minutes)

        current_checkpoint = int(session_minutes / interval)
        last_checkpoint = int(self._last_checkpoint_minutes / interval)

        if current_checkpoint > last_checkpoint:
            self._last_checkpoint_minutes = session_minutes

            if self._stability_history:
                recent = [s for _, s in list(self._stability_history)[-60:]]
                avg_stability = sum(recent) / len(recent)
            else:
                avg_stability = 1.0

            if avg_stability < self._jitter_threshold:
                self._jitter_triggered = True
                self._jitter_trigger_minute = session_minutes

    def _compute_time_fatigue(self, session_minutes: float) -> float:
        """
        Time-based fatigue, accelerated if jitter was detected at a checkpoint.
        """
        if self._jitter_triggered and self._jitter_trigger_minute is not None:
            minutes_since_trigger = session_minutes - self._jitter_trigger_minute
            if minutes_since_trigger > 0:
                if minutes_since_trigger <= 5.0:
                    return 0.3 + 0.3 * (minutes_since_trigger / 5.0)
                elif minutes_since_trigger <= 15.0:
                    return 0.6 + 0.4 * ((minutes_since_trigger - 5.0) / 10.0)
                else:
                    return 1.0

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

    def _compute_stability_fatigue(self) -> float:
        if not self._stability_history:
            return 0.0

        scores = [s for _, s in self._stability_history]
        avg = sum(scores) / len(scores)
        return max(0.0, min(1.0, 1.0 - avg))

    def _compute_error_fatigue(self) -> float:
        if not self._error_history:
            return 0.0

        errors = [e for _, e in self._error_history]
        rate = sum(1 for e in errors if e) / len(errors)
        return rate

    def _compute_degradation(self) -> float:
        if self._baseline_mean is None or self._baseline_mean == 0:
            return 0.0

        if not self._stability_history:
            return 0.0

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
        degradation_normalized = degradation / 100.0

        return (
            0.40 * time_fatigue
            + 0.25 * stability_fatigue
            + 0.15 * error_fatigue
            + 0.20 * degradation_normalized
        )

    def _classify(self, score: float) -> FatigueLevel:
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
        if level == FatigueLevel.FRESH:
            return None

        minutes_str = f"{session_minutes:.0f}"
        interval = self._get_checkpoint_interval(session_minutes)

        jitter_note = ""
        if self._jitter_triggered and self._jitter_trigger_minute is not None:
            jitter_note = (
                f" High hand tremor detected at "
                f"{self._jitter_trigger_minute:.0f}-minute checkpoint "
                f"(monitoring interval: {interval:.0f} min)."
            )

        if level == FatigueLevel.MILD:
            return (
                f"Session running for {minutes_str} minutes.{jitter_note} "
                f"Mild fatigue detected. Consider a short break soon."
            )
        elif level == FatigueLevel.MODERATE:
            return (
                f"Session running for {minutes_str} minutes.{jitter_note} "
                f"Performance down {degradation:.0f}%. "
                f"A 1-minute break is recommended."
            )
        elif level == FatigueLevel.HIGH:
            return (
                f"Session running for {minutes_str} minutes.{jitter_note} "
                f"Performance degraded by {degradation:.0f}%. "
                f"Please take a 2-minute break to maintain accuracy."
            )
        else:
            return (
                f"CRITICAL: Session has been running for {minutes_str} minutes.{jitter_note} "
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