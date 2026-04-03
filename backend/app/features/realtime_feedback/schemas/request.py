from pydantic import BaseModel, Field


class FrameRequest(BaseModel):
    frame_id: int = Field(..., ge=0)
    timestamp_ms: int = Field(..., ge=0)
    landmarks: list[list[float]]
    procedure_id: str
