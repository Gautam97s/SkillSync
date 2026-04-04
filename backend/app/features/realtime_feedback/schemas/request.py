import math

from pydantic import BaseModel, Field, field_validator


class FrameRequest(BaseModel):
    frame_id: int = Field(..., ge=0)
    timestamp_ms: int = Field(..., ge=0)
    landmarks: list[list[float]]
    procedure_id: str
    difficulty: str = Field("beginner", description="beginner or intermediate")
    student_id: str = Field("anonymous", description="Student identifier")

    @field_validator("student_id", mode="before")
    @classmethod
    def normalize_student_id(cls, value: object) -> str:
        if value is None or (isinstance(value, str) and not value.strip()):
            return "anonymous"
        return str(value).strip().lower()

    @field_validator("landmarks", mode="before")
    @classmethod
    def coerce_landmarks(cls, value: object) -> list[list[float]]:
        """Drop bad points instead of failing the whole frame (keeps the socket alive)."""
        if not isinstance(value, list):
            return []
        out: list[list[float]] = []
        for item in value:
            if not isinstance(item, (list, tuple)) or len(item) < 3:
                continue
            try:
                x, y, z = float(item[0]), float(item[1]), float(item[2])
                if not all(math.isfinite(v) for v in (x, y, z)):
                    continue
                out.append([x, y, z])
            except (TypeError, ValueError):
                continue
        return out
