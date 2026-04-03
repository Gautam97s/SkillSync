from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AngleConstraint(BaseModel):
    min: float = Field(..., description="Minimum allowed angle value (inclusive).")
    max: float = Field(..., description="Maximum allowed angle value (inclusive).")


class DistanceConstraint(BaseModel):
    max: float = Field(..., description="Maximum allowed distance value (inclusive).")


class StepConstraints(BaseModel):
    angles: dict[str, AngleConstraint] = Field(default_factory=dict)
    distances: dict[str, DistanceConstraint] = Field(default_factory=dict)


class StepSchema(BaseModel):
    id: str
    constraints: StepConstraints = Field(default_factory=StepConstraints)
    dwell_time_ms: int = Field(0, ge=0)
    next_step: str


class ProcedureSchema(BaseModel):
    procedure_id: str
    steps: list[StepSchema]

    def step_by_id(self) -> dict[str, StepSchema]:
        return {s.id: s for s in self.steps}


PROCEDURES: dict[str, dict[str, Any]] = {
    # Hardcoded demo schema; later we can swap this to JSON files.
    "surgical_knot_tying": {
        "procedure_id": "surgical_knot_tying",
        "steps": [
            {
                "id": "grip_init",
                "constraints": {
                    "angles": {"mcp_joint": {"min": 20.0, "max": 45.0}},
                    "distances": {"thumb_index_distance": {"max": 0.08}},
                },
                "dwell_time_ms": 700,
                "next_step": "hold_steady",
            },
            {
                "id": "hold_steady",
                "constraints": {
                    "angles": {"mcp_joint": {"min": 20.0, "max": 45.0}},
                    "distances": {"thumb_index_distance": {"max": 0.2}},
                },
                "dwell_time_ms": 3000,
                "next_step": "completed",
            },
            {
                "id": "completed",
                "constraints": {"angles": {}, "distances": {}},
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

