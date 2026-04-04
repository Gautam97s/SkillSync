"""
Skill-decay prediction based on the Ebbinghaus forgetting curve.

    competency(t) = S₀ × e^(-λ × t)

Where:
    S₀  = initial competency score after last session (0–1)
    λ   = personal decay rate (higher = forgets faster)
    t   = days since last session

λ is estimated per-student from their historical session data.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone, timedelta
from typing import Any

from pydantic import BaseModel

from app.core.database import get_db


class DecaySummary(BaseModel):
    """Serialized decay prediction (REST + WebSocket)."""

    student_id: str
    total_sessions: int
    last_session_date: str | None = None
    last_score: float = 0.0
    decay_rate: float = 0.0
    current_competency: float = 0.0
    projected_decay_date: str | None = None
    days_until_decay: int | None = None
    refresher_date: str | None = None
    refresher_needed: bool = False


# -- constants -----------------------------------------------------------

COMPETENCY_THRESHOLD = 0.70   # below this → refresher needed
REFRESHER_BUFFER_DAYS = 1     # schedule refresher one day before projected decay
BASE_DECAY_RATE = 0.10        # default λ per day
MIN_DECAY_RATE = 0.02         # floor: even worst students don't forget instantly
MAX_DECAY_RATE = 0.30         # ceiling


def _estimate_decay_rate(sessions: list[dict[str, Any]]) -> float:
    """
    Estimate personal decay rate λ from session history.

    Factors that INCREASE λ (forgets faster):
    - Higher average hesitation time
    - Higher tremor score
    - Fewer total sessions (less practice = weaker memory)

    Factors that DECREASE λ (retains better):
    - More sessions (spaced repetition effect)
    - Lower hesitation / tremor
    """
    if not sessions:
        return BASE_DECAY_RATE

    n = len(sessions)

    # Average metrics across all sessions
    avg_hesitation = sum(s.get("avg_hesitation_ms", 0) for s in sessions) / n
    avg_tremor = sum(s.get("tremor_score", 0) for s in sessions) / n
    avg_score = sum(s.get("final_score", 0) for s in sessions) / n

    # Start with base rate
    lam = BASE_DECAY_RATE

    # Practice effect: more sessions → slower decay (logarithmic benefit)
    # 1 session: ×1.0, 5 sessions: ×0.62, 10 sessions: ×0.57
    practice_factor = 1.0 / (1.0 + 0.15 * math.log(1 + n))
    lam *= practice_factor

    # Hesitation penalty: higher hesitation → faster decay
    # Normalized: 0ms = no penalty, 3000ms+ = +50% decay
    hesitation_factor = 1.0 + min(0.5, avg_hesitation / 6000.0)
    lam *= hesitation_factor

    # Tremor penalty: higher tremor → faster decay
    # tremor_score is 0–1, with 0 = perfectly stable, 1 = very shaky
    tremor_factor = 1.0 + (avg_tremor * 0.4)
    lam *= tremor_factor

    # Score bonus: high average score → slightly slower decay
    score_factor = 1.0 - (avg_score * 0.2)
    lam *= max(0.5, score_factor)

    return max(MIN_DECAY_RATE, min(MAX_DECAY_RATE, lam))


def _compute_competency(s0: float, lam: float, days: float) -> float:
    """competency(t) = S₀ × e^(-λ×t)"""
    return s0 * math.exp(-lam * max(0.0, days))


def _days_until_threshold(s0: float, lam: float, threshold: float = COMPETENCY_THRESHOLD) -> float | None:
    """Solve for t where competency(t) = threshold → t = -ln(threshold/S₀)/λ"""
    if s0 <= 0 or lam <= 0:
        return None
    ratio = threshold / s0
    if ratio >= 1.0:
        return 0.0  # already below threshold
    if ratio <= 0:
        return None
    return -math.log(ratio) / lam


def predict_decay(student_id: str) -> dict[str, Any]:
    """
    Generate a full decay prediction for a student.

    Returns:
    {
        "student_id": str,
        "total_sessions": int,
        "last_session_date": str | None,
        "last_score": float,
        "decay_rate": float,
        "current_competency": float,
        "projected_decay_date": str | None,
        "days_until_decay": int | None,
        "refresher_date": str | None,
        "refresher_needed": bool,
    }
    """
    db = get_db()

    sessions = db.fetch_all(
        """
        SELECT final_score, duration_ms, attempt_count,
               avg_hesitation_ms, tremor_score, completed_at
        FROM sessions
        WHERE student_id = ? AND passed = 1
        ORDER BY completed_at ASC
        """,
        (student_id,),
    )

    if not sessions:
        return {
            "student_id": student_id,
            "total_sessions": 0,
            "last_session_date": None,
            "last_score": 0.0,
            "decay_rate": BASE_DECAY_RATE,
            "current_competency": 0.0,
            "projected_decay_date": None,
            "days_until_decay": None,
            "refresher_date": None,
            "refresher_needed": False,
        }

    last = sessions[-1]
    s0 = float(last.get("final_score", 0.0))
    last_date_str = str(last.get("completed_at", ""))

    # Parse last session date
    try:
        last_date = datetime.fromisoformat(last_date_str.replace("Z", "+00:00"))
        if last_date.tzinfo is None:
            last_date = last_date.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        last_date = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    # Handle naive datetimes
    if last_date.tzinfo is None:
        days_elapsed = (now.replace(tzinfo=None) - last_date).total_seconds() / 86400.0
    else:
        days_elapsed = (now - last_date).total_seconds() / 86400.0

    # Estimate personal decay rate
    lam = _estimate_decay_rate(sessions)

    # Current competency
    current_comp = _compute_competency(s0, lam, days_elapsed)

    # Days until decay from last session
    total_days = _days_until_threshold(s0, lam)

    # Projected decay date & refresher date
    projected_decay_date = None
    refresher_date = None
    days_until_decay = None

    if total_days is not None:
        decay_dt = last_date + timedelta(days=total_days)
        projected_decay_date = decay_dt.isoformat()

        refresher_dt = decay_dt - timedelta(days=REFRESHER_BUFFER_DAYS)
        if refresher_dt < now:
            refresher_dt = now
        refresher_date = refresher_dt.isoformat()

        if last_date.tzinfo is None:
            days_until_decay = (decay_dt - now.replace(tzinfo=None)).total_seconds() / 86400.0
        else:
            days_until_decay = (decay_dt - now).total_seconds() / 86400.0

        days_until_decay = max(0, int(math.ceil(days_until_decay)))

    refresher_needed = (
        days_until_decay is not None and days_until_decay <= REFRESHER_BUFFER_DAYS
    ) or current_comp < COMPETENCY_THRESHOLD

    return {
        "student_id": student_id,
        "total_sessions": len(sessions),
        "last_session_date": last_date_str,
        "last_score": round(s0, 4),
        "decay_rate": round(lam, 4),
        "current_competency": round(max(0.0, min(1.0, current_comp)), 4),
        "projected_decay_date": projected_decay_date,
        "days_until_decay": round(days_until_decay, 1) if days_until_decay is not None else None,
        "refresher_date": refresher_date,
        "refresher_needed": bool(refresher_needed),
    }
