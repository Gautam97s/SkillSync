from fastapi import FastAPI

from app.core.settings import get_settings
from app.features.health.api import router as health_router
from app.features.realtime_feedback.api.websocket import router as websocket_router

settings = get_settings()
app = FastAPI(title=settings.app_name, version=settings.app_version)

app.include_router(health_router)
app.include_router(websocket_router)


@app.get("/")
def root() -> dict:
    return {"message": "GripSense backend is running"}
