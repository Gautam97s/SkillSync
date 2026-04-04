from typing import Optional

from pydantic import BaseModel

from app.features.procedure_intelligence.engine.decay_predictor import DecaySummary
from app.shared.models import FatigueAssessment


class FeedbackItem(BaseModel):
    code: str
    message: str
    severity: str = "info"


class StepInfo(BaseModel):
    id: str
    dwell_time_ms: int

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
    fatigue: FatigueAssessment | None = None
    skill_decay: Optional[DecaySummary] = None
