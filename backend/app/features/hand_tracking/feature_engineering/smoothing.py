_history: list[list[list[float]]] = []


def smooth_landmarks(landmarks: list[list[float]], window: int = 5) -> list[list[float]]:
    if not landmarks:
        return []

    _history.append(landmarks)
    if len(_history) > window:
        _history.pop(0)

    smoothed: list[list[float]] = []
    point_count = len(landmarks)
    for idx in range(point_count):
        xs = [frame[idx][0] for frame in _history]
        ys = [frame[idx][1] for frame in _history]
        zs = [frame[idx][2] for frame in _history]
        smoothed.append([
            sum(xs) / len(xs),
            sum(ys) / len(ys),
            sum(zs) / len(zs),
        ])

    return smoothed
