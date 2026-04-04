import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any
import pytest

cv2 = pytest.importorskip("cv2", reason="OpenCV is required for live camera websocket tests")
import websockets

# Ensure the backend directory is in the path to allow absolute imports from app module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.features.hand_tracking.cv.hand_tracker import HandTracker


HAND_CONNECTIONS = [
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),
    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),
    (5, 9),
    (9, 10),
    (10, 11),
    (11, 12),
    (9, 13),
    (13, 14),
    (14, 15),
    (15, 16),
    (13, 17),
    (0, 17),
    (17, 18),
    (18, 19),
    (19, 20),
]


@dataclass
class ClientConfig:
    ws_url: str = "ws://127.0.0.1:8000/ws/stream"
    procedure_id: str = "surgical_knot_tying"
    camera_index: int = 0
    camera_url: str | None = None
    send_fps: int = 20


def _now_ms() -> int:
    return int(time.time() * 1000)


def _candidate_camera_urls(url: str) -> list[str]:
    """
    OpenCV can be picky about MJPEG endpoints. Some apps expose multiple paths.
    Try a few common variants.
    """
    url = url.strip()
    if not url:
        return []

    candidates = [url]

    # Common alternates for phone webcam / MJPEG servers.
    if url.endswith("/video"):
        candidates.append(url.removesuffix("/video") + "/mjpegfeed")
        candidates.append(url.removesuffix("/video") + "/mjpeg")
        candidates.append(url.removesuffix("/video") + "/videofeed")
    if url.endswith("/mjpegfeed"):
        candidates.append(url.removesuffix("/mjpegfeed") + "/video")

    # Some servers require a trailing slash or a query to trigger a stream.
    candidates.append(url + "/")
    candidates.append(url + "?")

    # De-dup preserving order.
    seen: set[str] = set()
    out: list[str] = []
    for c in candidates:
        if c not in seen:
            out.append(c)
            seen.add(c)
    return out


def _open_capture(source: int | str) -> cv2.VideoCapture | None:
    """
    Attempt to open a capture source with reasonable fallbacks on Windows.
    """
    if isinstance(source, int):
        cap = cv2.VideoCapture(source)
        return cap if cap.isOpened() else None

    # URL: prefer FFMPEG backend if available.
    for backend in (getattr(cv2, "CAP_FFMPEG", None), getattr(cv2, "CAP_ANY", None)):
        if backend is None:
            continue
        cap = cv2.VideoCapture(source, backend)
        if cap.isOpened():
            return cap
        cap.release()
    return None


def _draw_hand_overlay(frame: Any, landmarks: list[list[float]]) -> None:
    if not landmarks:
        return
    h, w, _ = frame.shape

    for idx1, idx2 in HAND_CONNECTIONS:
        if idx1 < len(landmarks) and idx2 < len(landmarks):
            x1, y1 = int(landmarks[idx1][0] * w), int(landmarks[idx1][1] * h)
            x2, y2 = int(landmarks[idx2][0] * w), int(landmarks[idx2][1] * h)
            cv2.line(frame, (x1, y1), (x2, y2), (255, 255, 255), 2)

    for idx, (x, y, _z) in enumerate(landmarks):
        cx, cy = int(x * w), int(y * h)
        cv2.circle(frame, (cx, cy), 5, (255, 0, 255), cv2.FILLED)
        cv2.putText(
            frame,
            str(idx),
            (cx + 8, cy - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )


def _draw_backend_overlay(frame: Any, *, last_response: dict | None) -> None:
    if not last_response:
        cv2.putText(
            frame,
            "WS: waiting for response...",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )
        return

    step = str(last_response.get("step", ""))
    valid = bool(last_response.get("valid", False))
    score = float(last_response.get("score", 0.0))
    feedback = last_response.get("feedback") or []
    first_msg = ""
    if isinstance(feedback, list) and feedback:
        item = feedback[0] or {}
        first_msg = str(item.get("message") or "")

    color = (0, 200, 0) if valid else (0, 0, 255)
    cv2.putText(
        frame,
        f"step={step} valid={valid} score={score:.2f}",
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        color,
        2,
        cv2.LINE_AA,
    )
    if first_msg:
        cv2.putText(
            frame,
            first_msg[:90],
            (10, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 0),
            2,
            cv2.LINE_AA,
        )


async def main() -> None:
    cfg = ClientConfig(
        ws_url=os.getenv("WS_URL", "ws://127.0.0.1:8000/ws/stream"),
        procedure_id=os.getenv("PROCEDURE_ID", "surgical_knot_tying"),
        camera_index=int(os.getenv("CAMERA_INDEX", "0")),
        camera_url=os.getenv("CAMERA_URL") or None,
        send_fps=int(os.getenv("SEND_FPS", "20")),
    )

    tracker = HandTracker()
    cap: cv2.VideoCapture | None = None
    cap_source: int | str

    if cfg.camera_url:
        tried: list[str] = []
        for candidate in _candidate_camera_urls(cfg.camera_url):
            tried.append(candidate)
            cap = _open_capture(candidate)
            if cap is not None:
                cap_source = candidate
                break
        else:
            raise RuntimeError(
                "Could not open camera_url with OpenCV.\n"
                f"camera_url={cfg.camera_url!r}\n"
                f"tried={tried!r}\n"
                "Tip: If you're using DroidCam on Windows, the most reliable option is the "
                "DroidCam Windows client + virtual webcam device, then run with CAMERA_INDEX=1/2/etc."
            )
    else:
        cap_source = cfg.camera_index
        cap = _open_capture(cap_source)
        if cap is None:
            raise RuntimeError(f"Could not open camera index={cap_source!r}")

    print("Starting live WS camera client. Press 'q' to quit.")
    print(f"WS URL: {cfg.ws_url}")
    print(f"procedure_id: {cfg.procedure_id}")
    if cfg.camera_url:
        print(f"camera_url: {cfg.camera_url}")
    else:
        print(f"camera_index: {cfg.camera_index}")

    last_response: dict | None = None
    frame_id = 0
    send_interval_s = 1.0 / max(1, int(cfg.send_fps))
    last_send_t = 0.0

    try:
        async with websockets.connect(cfg.ws_url) as ws:
            while cap.isOpened():
                ok, frame = cap.read()
                if not ok:
                    continue

                frame = cv2.flip(frame, 1)
                landmarks = tracker.process(frame)

                # Draw hand skeleton regardless of WS response
                _draw_hand_overlay(frame, landmarks)

                # Send at a capped FPS to reduce load.
                now_t = time.time()
                should_send = (now_t - last_send_t) >= send_interval_s
                if should_send:
                    payload = {
                        "frame_id": frame_id,
                        "timestamp_ms": _now_ms(),
                        "procedure_id": cfg.procedure_id,
                        "landmarks": landmarks,
                    }
                    await ws.send(json.dumps(payload))
                    frame_id += 1
                    last_send_t = now_t

                    # Don't hang forever if the backend stops responding.
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        last_response = json.loads(raw)
                    except TimeoutError:
                        last_response = last_response or {
                            "step": "",
                            "valid": False,
                            "score": 0.0,
                            "feedback": [{"message": "Timed out waiting for backend", "code": "WS_TIMEOUT"}],
                        }
                    except Exception as e:
                        last_response = {
                            "step": "",
                            "valid": False,
                            "score": 0.0,
                            "feedback": [{"message": f"WS error: {e}", "code": "WS_ERROR"}],
                        }

                _draw_backend_overlay(frame, last_response=last_response)
                cv2.imshow("SkillSync WS Live Test", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    except KeyboardInterrupt:
        print("Interrupted. Exiting...")
    except Exception as e:
        print(f"Fatal error: {e}")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    asyncio.run(main())

