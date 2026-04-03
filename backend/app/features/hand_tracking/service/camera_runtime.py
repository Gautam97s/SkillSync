import threading
import time
from typing import Optional

import cv2

from app.features.hand_tracking.cv.hand_tracker import HandTracker
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class CameraRuntime:
    def __init__(self, *, fps: int = 30, device_index: int = 0) -> None:
        self._fps = max(fps, 1)
        self._device_index = device_index
        self._tracker: Optional[HandTracker] = None
        self._capture: Optional[cv2.VideoCapture] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._running = False
        self._latest_landmarks: list[list[float]] = []
        self._latest_timestamp_ms: int = 0

    def start(self) -> bool:
        if self._running:
            return True

        try:
            if self._tracker is None:
                self._tracker = HandTracker()
        except Exception as exc:
            logger.exception("Failed to initialize hand tracker: %s", exc)
            return False

        self._capture = cv2.VideoCapture(self._device_index)
        if not self._capture.isOpened():
            logger.error("Failed to open camera device %s", self._device_index)
            self._capture.release()
            self._capture = None
            return False

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        self._running = True
        logger.info("Camera runtime started on device %s", self._device_index)
        return True

    def stop(self) -> None:
        if not self._running:
            return

        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)

        if self._capture is not None:
            self._capture.release()
            self._capture = None

        self._thread = None
        self._running = False
        logger.info("Camera runtime stopped")

    def is_running(self) -> bool:
        return self._running

    def latest_landmarks(self) -> list[list[float]]:
        with self._lock:
            return list(self._latest_landmarks)

    def latest_timestamp_ms(self) -> int:
        with self._lock:
            return self._latest_timestamp_ms

    def _capture_loop(self) -> None:
        frame_interval = 1.0 / self._fps

        while not self._stop_event.is_set():
            start_time = time.perf_counter()
            if self._capture is None or self._tracker is None:
                break

            ok, frame = self._capture.read()
            if ok:
                landmarks = self._tracker.process(frame)
                with self._lock:
                    self._latest_landmarks = landmarks
                    self._latest_timestamp_ms = int(time.time() * 1000)

            elapsed = time.perf_counter() - start_time
            sleep_for = frame_interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)


_camera_runtime: Optional[CameraRuntime] = None


def get_camera_runtime(*, fps: int = 30, device_index: int = 0) -> CameraRuntime:
    global _camera_runtime
    if _camera_runtime is None:
        _camera_runtime = CameraRuntime(fps=fps, device_index=device_index)
    return _camera_runtime
