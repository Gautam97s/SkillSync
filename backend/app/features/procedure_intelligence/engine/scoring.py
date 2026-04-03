def compute_score(*, valid: bool, stability: float) -> float:
    """
    Overall score derived from constraint validity and rolling stability.

    Stability is expected to come from a jitter-history scorer (rolling window).
    """
    s = float(stability)
    if s < 0.0:
        s = 0.0
    if s > 1.0:
        s = 1.0
    return s if bool(valid) else (0.25 * s)
