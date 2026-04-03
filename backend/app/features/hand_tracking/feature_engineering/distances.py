import math

def compute_distances(landmarks: list[list[float]]) -> dict[str, float]:
    if not landmarks or len(landmarks) < 21:
        return {
            "thumb_index_distance": 0.0,
            "index_middle_distance": 0.0,
        }
        
    thumb_tip = landmarks[4]
    index_tip = landmarks[8]
    middle_tip = landmarks[12]

    thumb_index_dist = math.sqrt(
        (thumb_tip[0] - index_tip[0])**2 +
        (thumb_tip[1] - index_tip[1])**2 +
        (thumb_tip[2] - index_tip[2])**2
    )
    
    index_middle_dist = math.sqrt(
        (index_tip[0] - middle_tip[0])**2 +
        (index_tip[1] - middle_tip[1])**2 +
        (index_tip[2] - middle_tip[2])**2
    )

    return {
        "thumb_index_distance": thumb_index_dist,
        "index_middle_distance": index_middle_dist,
    }
