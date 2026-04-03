DISTANCE_KEY_ALIASES: dict[str, str] = {
    # Backward-compat with older schema/docs naming.
    "grip_distance": "thumb_index_distance",
}

from dataclasses import dataclass

from app.features.procedure_intelligence.engine.schema import StepConstraints
from app.features.procedure_intelligence.engine.schema import StepSchema


def _normalize_distance_keys(distances: dict[str, float]) -> dict[str, float]:
    normalized: dict[str, float] = {}
    for key, value in distances.items():
        normalized[DISTANCE_KEY_ALIASES.get(key, key)] = value
    return normalized


def evaluate_constraints(
    *,
    constraints: "StepConstraints",
    angles: dict[str, float],
    distances: dict[str, float],
) -> dict:
    """
    Evaluate a step's constraints and return a structured result:

    {
      "valid": bool,
      "violations": [
        {
          "constraint_key": str,
          "expected": {"min": float, "max": float} | {"max": float},
          "actual": float,
          "deviation_amount": float
        },
        ...
      ]
    }
    """
    distances = _normalize_distance_keys(distances)

    violations: list[dict] = []

    for key, c in (constraints.angles or {}).items():
        actual = float(angles.get(key, 0.0))
        if actual < c.min:
            violations.append(
                {
                    "constraint_key": key,
                    "expected": {"min": float(c.min), "max": float(c.max)},
                    "actual": actual,
                    "deviation_amount": float(c.min - actual),
                }
            )
        elif actual > c.max:
            violations.append(
                {
                    "constraint_key": key,
                    "expected": {"min": float(c.min), "max": float(c.max)},
                    "actual": actual,
                    "deviation_amount": float(actual - c.max),
                }
            )

    for key, c in (constraints.distances or {}).items():
        actual = float(distances.get(key, 0.0))
        if actual > c.max:
            violations.append(
                {
                    "constraint_key": key,
                    "expected": {"max": float(c.max)},
                    "actual": actual,
                    "deviation_amount": float(actual - c.max),
                }
            )

    return {"valid": len(violations) == 0, "violations": violations}


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    violations: list[dict]


def validate_step(
    *,
    step: "StepSchema",
    angles: dict[str, float],
    distances: dict[str, float],
) -> ValidationResult:
    result = evaluate_constraints(constraints=step.constraints, angles=angles, distances=distances)
    return ValidationResult(valid=bool(result["valid"]), violations=list(result.get("violations") or []))
