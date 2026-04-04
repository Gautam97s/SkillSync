"""
Accumulates per-frame data during a live procedure session and writes a
summary row to the ``sessions`` table when the procedure completes.

Tracks:
- Hesitation: time-to-achieve for each step
- Oscillation: valid↔invalid transition count (uncertainty signal)
- Tremor: rolling stability score during dwell holds

One instance per WebSocket session.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.database import get_db


@dataclass
class _StepMetrics:
    entered_ms: int = 0
    achieved_ms: int | None = None
    oscillations: int = 0
    last_valid: bool = False
    stability_sum: float = 0.0
    stability_count: int = 0


@dataclass
class SessionAggregator:
    student_id: str = "anonymous"
    procedure_id: str = "surgical_knot_tying"
    difficulty: str = "beginner"
    started_ms: int | None = None
    _step_metrics: dict[str, _StepMetrics] = field(default_factory=dict)
    _current_step: str | None = None
    _frame_count: int = 0
    _score_sum: float = 0.0
    _completed: bool = False

    def feed_frame(
        self,
        *,
        step_id: str,
        valid: bool,
        score: float,
        stability: float,
        timestamp_ms: int,
    ) -> None:
        """Called once per pipeline frame to accumulate metrics."""
        if self._completed:
            return

        if self.started_ms is None:
            self.started_ms = timestamp_ms

        self._frame_count += 1
        self._score_sum += score

        # -- per-step tracking --
        if step_id not in self._step_metrics:
            self._step_metrics[step_id] = _StepMetrics(entered_ms=timestamp_ms)

        sm = self._step_metrics[step_id]

        # Track step transitions
        if step_id != self._current_step:
            self._current_step = step_id
            if sm.entered_ms == 0:
                sm.entered_ms = timestamp_ms

        # Track oscillations (valid→invalid transitions)
        if sm.last_valid and not valid:
            sm.oscillations += 1
        sm.last_valid = valid

        # Track when step is first achieved
        if valid and sm.achieved_ms is None:
            sm.achieved_ms = timestamp_ms

        # Accumulate stability during valid frames (tremor signal)
        if valid:
            sm.stability_sum += stability
            sm.stability_count += 1

    def complete_session(self, *, timestamp_ms: int) -> dict[str, Any] | None:
        """
        Finalize metrics and persist to database.
        Returns the saved session dict, or None if already completed / no data.
        """
        if self._completed or self.started_ms is None:
            return None
        self._completed = True

        # Compute summary metrics
        duration_ms = timestamp_ms - self.started_ms

        # Average hesitation: mean time-to-achieve across steps (excluding 'completed')
        hesitation_times: list[float] = []
        total_oscillations = 0
        total_stability = 0.0
        stability_frames = 0

        for step_id, sm in self._step_metrics.items():
            if step_id == "completed":
                continue

            if sm.achieved_ms is not None and sm.entered_ms > 0:
                hesitation_times.append(float(sm.achieved_ms - sm.entered_ms))

            total_oscillations += sm.oscillations
            total_stability += sm.stability_sum
            stability_frames += sm.stability_count

        avg_hesitation_ms = (
            sum(hesitation_times) / len(hesitation_times) if hesitation_times else 0.0
        )
        tremor_score = (
            1.0 - (total_stability / stability_frames) if stability_frames > 0 else 0.5
        )
        # Compute a fair score rather than raw frame average (which heavily penalizes transition time)
        # 100% minus 2% for each oscillation and minus the tremor penalty directly.
        error_penalty = (total_oscillations * 0.02)
        final_score = max(0.2, min(1.0, 1.0 - error_penalty - tremor_score))

        # Persist into database
        db = get_db()

        # Ensure student exists
        existing = db.fetch_one("SELECT id FROM students WHERE id = ?", (self.student_id,))
        if not existing:
            db.execute("INSERT INTO students (id) VALUES (?)", (self.student_id,))

        db.execute(
            """
            INSERT INTO sessions
                (student_id, procedure_id, difficulty, final_score,
                 duration_ms, attempt_count, avg_hesitation_ms, tremor_score, passed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                self.student_id,
                self.procedure_id,
                self.difficulty,
                round(final_score, 4),
                int(duration_ms),
                int(total_oscillations),
                round(avg_hesitation_ms, 1),
                round(tremor_score, 4),
                1,  # passed = True (only called on completion)
            ),
        )

        return {
            "student_id": self.student_id,
            "final_score": round(final_score, 4),
            "duration_ms": int(duration_ms),
            "attempt_count": int(total_oscillations),
            "avg_hesitation_ms": round(avg_hesitation_ms, 1),
            "tremor_score": round(tremor_score, 4),
        }
