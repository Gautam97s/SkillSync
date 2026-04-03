from typing import Optional

from pydantic import BaseModel


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

class FrameResponse(BaseModel):
    step: str
    valid: bool
    score: float
    feedback: list[FeedbackItem]
    landmarks: list[list[float]] = []
    angles: dict[str, float] = {}
    distances: dict[str, float] = {}
    procedure_steps: list[StepInfo] = []
    reset: bool = False
