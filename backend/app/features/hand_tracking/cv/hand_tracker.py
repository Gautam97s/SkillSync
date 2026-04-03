from typing import Any


class HandTracker:
    """Placeholder wrapper for MediaPipe Hands integration."""

    def __init__(self) -> None:
        self._tracker: Any = None

    def process(self, frame: Any) -> list[list[float]]:
        # Integrate MediaPipe processing here and return hand landmarks.
        _ = frame
        return []
