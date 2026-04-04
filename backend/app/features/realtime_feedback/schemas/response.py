from typing import Optional

from pydantic import BaseModel, Field


class FeedbackItem(BaseModel):
    code: str
    message: str
    severity: str = "info"


class StepInfo(BaseModel):
    id: str
    dwell_time_ms: int

class FatigueInfo(BaseModel):
    fatigue_level: str
    fatigue_score: float
    recommended_break_seconds: int
    session_minutes: float
    warning_message: Optional[str] = None

def _default_fatigue_info() -> FatigueInfo:
    return FatigueInfo(
        fatigue_level="fresh",
        fatigue_score=0.0,
        recommended_break_seconds=0,
        session_minutes=0.0,
        warning_message=None,
    )


class FrameResponse(BaseModel):
    step: str
    valid: bool
    score: float
    feedback: list[FeedbackItem]
    landmarks: list[list[float]] = []
    joint_confidence: dict[str, float] = {}
    landmarks_estimated: bool = False
    angles: dict[str, float] = {}
    distances: dict[str, float] = {}
    procedure_steps: list[StepInfo] = []
    reset: bool = False
    difficulty: str = "beginner"
session_saved: bool = False
fatigue: FatigueInfo = Field(default_factory=_default_fatigue_info)
