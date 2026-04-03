import math


def _euclidean_3d(a: list[float], b: list[float]) -> float:
    return math.sqrt(
        (a[0] - b[0]) ** 2 +
        (a[1] - b[1]) ** 2 +
        (a[2] - b[2]) ** 2
    )


def compute_distances(landmarks: list[list[float]]) -> dict[str, float]:
    if not landmarks or len(landmarks) < 21:
        return {
            "thumb_index_distance": 0.0,
            "index_middle_distance": 0.0,
            "palm_width": 0.0,
            "thumb_index_over_palm": 0.0,
            "index_middle_over_palm": 0.0,
            "middle_below_index": 0.0,
        }
        
    thumb_tip = landmarks[4]
    index_tip = landmarks[8]
    middle_tip = landmarks[12]

    thumb_index_dist = _euclidean_3d(thumb_tip, index_tip)
    
    index_middle_dist = _euclidean_3d(index_tip, middle_tip)

    # Reference for scale normalization: distance between index MCP (5) and pinky MCP (17).
    palm_width = _euclidean_3d(landmarks[5], landmarks[17])
    if palm_width <= 1e-6:
        thumb_index_over_palm = 0.0
        index_middle_over_palm = 0.0
    else:
        thumb_index_over_palm = thumb_index_dist / palm_width
        index_middle_over_palm = index_middle_dist / palm_width

    # Image/canvas coordinates increase downward on y.
    middle_below_index = 1.0 if middle_tip[1] > index_tip[1] else 0.0

    return {
        "thumb_index_distance": thumb_index_dist,
        "index_middle_distance": index_middle_dist,
        "palm_width": palm_width,
        "thumb_index_over_palm": thumb_index_over_palm,
        "index_middle_over_palm": index_middle_over_palm,
        "middle_below_index": middle_below_index,
    }
