import math

def calculate_angle_3d(p1: list[float], p2: list[float], p3: list[float]) -> float:
    """Calculates the angle (in degrees) between three 3D points, where p2 is the vertex."""
    v1 = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
    v2 = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]]
    
    dot_prod = sum(v1[i] * v2[i] for i in range(3))
    mag1 = math.sqrt(sum(v1[i]**2 for i in range(3)))
    mag2 = math.sqrt(sum(v2[i]**2 for i in range(3)))
    
    if mag1 * mag2 == 0:
        return 0.0
    
    cos_angle = max(-1.0, min(1.0, dot_prod / (mag1 * mag2)))
    return math.degrees(math.acos(cos_angle))

def compute_angles(landmarks: list[list[float]]) -> dict[str, float]:
    if not landmarks or len(landmarks) < 21:
        return {
            "thumb_index_angle": 0.0,
            "wrist_finger_angle": 0.0,
            "mcp_joint": 0.0,
            "pip_joint": 0.0,
        }
        
    # Thumb tip (4) to Wrist (0) to Index tip (8) angle
    thumb_index_angle = calculate_angle_3d(landmarks[4], landmarks[0], landmarks[8])
    
    # Wrist (0) to Middle MCP (9) to Middle Tip (12) angle
    wrist_finger_angle = calculate_angle_3d(landmarks[0], landmarks[9], landmarks[12])
    
    # Index MCP joint: angle at landmark 5 between metacarpal (4) and PIP (6)
    mcp_joint = calculate_angle_3d(landmarks[4], landmarks[5], landmarks[6])
    
    # Index PIP joint: angle at landmark 6 between MCP (5) and DIP (7)
    pip_joint = calculate_angle_3d(landmarks[5], landmarks[6], landmarks[7])

    return {
        "thumb_index_angle": thumb_index_angle,
        "wrist_finger_angle": wrist_finger_angle,
        "mcp_joint": mcp_joint,
        "pip_joint": pip_joint,
    }
