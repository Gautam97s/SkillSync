from fastapi import APIRouter

from app.features.health.detailed import run_detailed_health_check

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health() -> dict:
    return {"status": "ok"}


@router.get("/detailed")
def detailed_health() -> dict:
    return run_detailed_health_check()