def validate_step(*, angles: dict[str, float], distances: dict[str, float]) -> bool:
    thumb_index_angle = angles.get("thumb_index_angle", 0.0)
    thumb_index_distance = distances.get("thumb_index_distance", 0.0)

    return 20.0 <= thumb_index_angle <= 70.0 and thumb_index_distance <= 0.2
