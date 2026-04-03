from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class AngleConstraint(BaseModel):
    min: float = Field(..., description="Minimum allowed angle value (inclusive).")
    max: float = Field(..., description="Maximum allowed angle value (inclusive).")


class DistanceConstraint(BaseModel):
    min: float | None = Field(
        None,
        description="Minimum allowed distance value (inclusive).",
    )
    max: float | None = Field(
        None,
        description="Maximum allowed distance value (inclusive).",
    )

    @model_validator(mode="after")
    def _require_min_or_max(self) -> "DistanceConstraint":
        if self.min is None and self.max is None:
            raise ValueError("At least one of 'min' or 'max' must be provided.")
        return self


class ScalarConstraint(BaseModel):
    min: float | None = Field(
        None,
        description="Minimum allowed scalar value (inclusive).",
    )
    max: float | None = Field(
        None,
        description="Maximum allowed scalar value (inclusive).",
    )

    @model_validator(mode="after")
    def _require_min_or_max(self) -> "ScalarConstraint":
        if self.min is None and self.max is None:
            raise ValueError("At least one of 'min' or 'max' must be provided.")
        return self


class StepConstraints(BaseModel):
    angles: dict[str, AngleConstraint] = Field(default_factory=dict)
    distances: dict[str, DistanceConstraint] = Field(default_factory=dict)
    scalars: dict[str, ScalarConstraint] = Field(default_factory=dict)


class StepSchema(BaseModel):
    id: str
    name: str | None = None
    description: str | None = None
    method: str | None = None
    feedback: dict[str, str] = Field(default_factory=dict)
    constraints: StepConstraints = Field(default_factory=StepConstraints)
    dwell_time_ms: int = Field(0, ge=0)
    next_step: str


class ProcedureSchema(BaseModel):
    procedure_id: str
    steps: list[StepSchema]

    def step_by_id(self) -> dict[str, StepSchema]:
        return {s.id: s for s in self.steps}


PROCEDURES: dict[str, dict[str, Any]] = {
    # Keep the existing procedure_id so current clients continue working.
    "surgical_knot_tying": {
        "procedure_id": "surgical_knot_tying",
        "steps": [
            {
                "id": "thumb_index_precision_grip",
                "name": "Thumb-Index Precision Grip",
                "description": "Keep thumb and index finger close for precision grip.",
                "method": "Compute thumb-index distance normalized by palm width and keep it under threshold.",
                "feedback": {
                    "correct": "Good precision grip",
                    "incorrect": "Bring thumb and index finger closer",
                },
                "constraints": {
                    "distances": {"thumb_index_over_palm": {"min": 0.0, "max": 0.25}},
                },
                "dwell_time_ms": 0,
                "next_step": "middle_finger_support",
            },
            {
                "id": "middle_finger_support",
                "name": "Middle Finger Support",
                "description": "Use middle finger to support grip.",
                "method": "Validate index-middle spacing, vertical support position, and finger alignment angle.",
                "feedback": {
                    "correct": "Middle finger support is correct",
                    "incorrect": "Use middle finger to support the grip",
                },
                "constraints": {
                    "distances": {"index_middle_over_palm": {"max": 0.35}},
                    "angles": {"index_middle_alignment": {"min": 0.0, "max": 40.0}},
                    "scalars": {"middle_below_index": {"min": 1.0, "max": 1.0}},
                },
                "dwell_time_ms": 0,
                "next_step": "initial_incision_position",
            },
            {
                "id": "initial_incision_position",
                "name": "Initial Incision Position",
                "description": "Start with scalpel perpendicular to surface.",
                "method": "Compute wrist-index MCP-index tip angle and hold near 90 degrees.",
                "feedback": {
                    "correct": "Correct starting position",
                    "incorrect": "Hold scalpel perpendicular (~90 degrees)",
                },
                "constraints": {
                    "angles": {"wrist_index_angle": {"min": 80.0, "max": 100.0}},
                },
                "dwell_time_ms": 0,
                "next_step": "cutting_angle_control",
            },
            {
                "id": "cutting_angle_control",
                "name": "Cutting Angle Control",
                "description": "Maintain proper scalpel angle during cutting.",
                "method": "Compute wrist-index MCP-index tip angle and keep it around 45 degrees.",
                "feedback": {
                    "correct": "Angle is correct",
                    "incorrect": "Adjust wrist angle to around 45 degrees",
                },
                "constraints": {
                    "angles": {"wrist_index_angle": {"min": 30.0, "max": 60.0}},
                },
                "dwell_time_ms": 0,
                "next_step": "grip_stability",
            },
            {
                "id": "grip_stability",
                "name": "Grip Stability",
                "description": "Maintain stable grip for a short duration.",
                "method": "Keep all constraints satisfied continuously for 2 seconds.",
                "feedback": {
                    "correct": "Stable grip maintained",
                    "incorrect": "Hold position steadily",
                },
                "constraints": {
                    "angles": {"wrist_index_angle": {"min": 30.0, "max": 60.0}},
                    "distances": {
                        "thumb_index_over_palm": {"min": 0.0, "max": 0.25},
                        "index_middle_over_palm": {"max": 0.35},
                    },
                    "scalars": {"middle_below_index": {"min": 1.0, "max": 1.0}},
                },
                "dwell_time_ms": 2000,
                "next_step": "completed",
            },
            {
                "id": "completed",
                "name": "Completed",
                "description": "Procedure completed successfully.",
                "constraints": {"angles": {}, "distances": {}, "scalars": {}},
                "dwell_time_ms": 0,
                "next_step": "completed",
            },
        ],
    }
}


LoadSchemaErrorCode = Literal["unknown_procedure_id"]


class LoadSchemaError(ValueError):
    def __init__(self, code: LoadSchemaErrorCode, message: str):
        super().__init__(message)
        self.code = code


def load_procedure_schema(procedure_id: str) -> ProcedureSchema:
    raw = PROCEDURES.get(procedure_id)
    if raw is None:
        raise LoadSchemaError(
            "unknown_procedure_id",
            f"Unknown procedure_id={procedure_id!r}. Available={sorted(PROCEDURES.keys())}",
        )
    return ProcedureSchema.model_validate(raw)

