from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.settings import get_settings
from app.features.hand_tracking.service.camera_runtime import get_camera_runtime
from app.features.health.api import router as health_router
from app.features.realtime_feedback.api.websocket import router as websocket_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    camera_runtime = get_camera_runtime(
        fps=settings.camera_fps,
        device_index=settings.camera_device_index,
    )

    if settings.auto_start_camera:
        camera_runtime.start()

    yield

    camera_runtime.stop()


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.include_router(health_router)
app.include_router(websocket_router)


@app.get("/")
def root() -> dict:
    return {"message": "GripSense backend is running"}
