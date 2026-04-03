from pydantic import BaseModel


class FeedbackItem(BaseModel):
    code: str
    message: str
    severity: str = "info"


class FrameResponse(BaseModel):
    step: str
    valid: bool
    score: float
    feedback: list[FeedbackItem]
    landmarks: list[list[float]] = []
