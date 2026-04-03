from functools import lru_cache

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "GripSense API"
    app_version: str = "0.1.0"
    camera_fps: int = 30
    smoothing_window: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
