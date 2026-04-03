from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.shared.exceptions import SkillSyncError
from app.core.settings import get_settings
from app.core.database import get_db
from app.features.hand_tracking.service.camera_runtime import get_camera_runtime
from app.features.health.api import router as health_router
from app.features.realtime_feedback.api.websocket import router as websocket_router
from app.features.procedure_intelligence.api.student_api import router as student_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Initialize SQLite database
    db = get_db()

    camera_runtime = get_camera_runtime(
        fps=settings.camera_fps,
        device_index=settings.camera_device_index,
    )

    if settings.auto_start_camera:
        camera_runtime.start()

    yield

    camera_runtime.stop()
    db.close()


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

@app.exception_handler(SkillSyncError)
async def skillsync_error_handler(request: Request, exc: SkillSyncError):
    """Global handler for all SkillSync custom exceptions."""
    return JSONResponse(
        status_code=400,
        content={
            "error": True,
            "code": exc.code,
            "message": exc.message
        }
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(websocket_router)
app.include_router(student_router)


@app.get("/")
def root() -> dict:
    return {"message": "GripSense backend is running"}
