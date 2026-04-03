from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class StabilityMetrics(BaseModel):
    """Output from stability scoring (5.1)."""
    
    stability_score: float = Field(..., ge=0.0, le=1.0, description="Overall stability score (0.0 = unstable, 1.0 = perfectly stable)")
    tremor_level: float = Field(..., ge=0.0, le=1.0, description="Tremor/shake detection (0.0 = no tremor, 1.0 = severe tremor)")
    variance_x: float = Field(..., ge=0.0, description="Variance in X coordinate over time window")
    variance_y: float = Field(..., ge=0.0, description="Variance in Y coordinate over time window")
    variance_z: float = Field(..., ge=0.0, description="Variance in Z coordinate over time window")
    window_size_ms: int = Field(..., gt=0, description="Time window size in milliseconds used for calculation")


class FatigueLevel(str, Enum):
    """Fatigue classification levels."""
    
    FRESH = "fresh"
    MILD = "mild"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class FatigueAssessment(BaseModel):
    """Output from fatigue detector (5.2)."""
    
    fatigue_level: FatigueLevel = Field(..., description="Classified fatigue level")
    fatigue_score: float = Field(..., ge=0.0, le=1.0, description="Continuous fatigue score (0.0 = fresh, 1.0 = critical)")
    recommended_break_seconds: int = Field(..., ge=0, description="Recommended break duration in seconds")
    performance_degradation_pct: float = Field(..., ge=0.0, le=100.0, description="Performance degradation percentage from baseline")
    time_since_last_break_minutes: float = Field(..., ge=0.0, description="Minutes elapsed since last break")
    warning_message: Optional[str] = Field(None, description="Human-readable warning message if fatigue detected")