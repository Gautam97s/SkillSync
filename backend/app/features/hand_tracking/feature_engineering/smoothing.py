_EMA_HISTORY: dict[str, list[list[float]]] = {}


def smooth_landmarks(
    landmarks: list[list[float]],
    *,
    session_key: str | None = None,
    alpha: float = 0.35,
) -> list[list[float]]:
    if not landmarks:
        return []

    key = session_key or "__default__"
    previous = _EMA_HISTORY.get(key)

    if previous is None or len(previous) != len(landmarks):
        smoothed = [point[:] for point in landmarks]
    else:
        beta = 1.0 - float(alpha)
        smoothed = []
        for idx, point in enumerate(landmarks):
            prev_point = previous[idx]
            smoothed.append([
                (float(alpha) * point[0]) + (beta * prev_point[0]),
                (float(alpha) * point[1]) + (beta * prev_point[1]),
                (float(alpha) * point[2]) + (beta * prev_point[2]),
            ])

    _EMA_HISTORY[key] = smoothed
    return smoothed
