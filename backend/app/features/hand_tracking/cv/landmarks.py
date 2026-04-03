def normalize_landmarks(landmarks: list[list[float]]) -> list[list[float]]:
    if not landmarks:
        return []

    base_x, base_y, base_z = landmarks[0]
    normalized: list[list[float]] = []
    for x, y, z in landmarks:
        normalized.append([x - base_x, y - base_y, z - base_z])
    return normalized
