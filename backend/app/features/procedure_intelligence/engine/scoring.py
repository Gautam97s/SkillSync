def compute_score(*, valid: bool, angles: dict[str, float], distances: dict[str, float]) -> float:
    _ = angles
    _ = distances
    return 0.9 if valid else 0.4
