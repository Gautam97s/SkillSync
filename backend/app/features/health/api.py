from fastapi import APIRouter

from app.features.hand_tracking.service.camera_runtime import get_camera_runtime

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health() -> dict:
    runtime = get_camera_runtime()
    return {
        "status": "ok",
        "camera_running": runtime.is_running(),
        "has_landmarks": len(runtime.latest_landmarks()) > 0,
    }
