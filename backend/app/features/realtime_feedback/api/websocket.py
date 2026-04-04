import json
import logging
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.features.procedure_intelligence.engine.state_machine import SESSIONS, get_session_state
from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.schemas.response import FeedbackItem, FrameResponse
from app.features.realtime_feedback.service.pipeline import process_frame
from app.shared.json_safe import sanitize_for_json

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    session_key = str(uuid4())
    last_procedure_id = "surgical_knot_tying"
    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception as exc:
                logger.warning("Malformed websocket payload: %s", exc)
                continue

            try:
                request = FrameRequest.model_validate(payload)
            except ValidationError as exc:
                logger.warning("Frame validation failed: %s", exc)
                continue

            last_procedure_id = request.procedure_id

            try:
                response = process_frame(request, session_key=session_key)
                out = sanitize_for_json(response.model_dump())
                text = json.dumps(
                    out, separators=(",", ":"), ensure_ascii=False, allow_nan=False
                )
                await websocket.send_text(text)
            except Exception:
                logger.exception("process_frame failed; sending fallback frame")
                st = get_session_state(
                    procedure_id=last_procedure_id, session_key=session_key
                )
                fallback = FrameResponse(
                    step=st.current_step_id,
                    valid=False,
                    score=0.0,
                    feedback=[
                        FeedbackItem(
                            code="SERVER_ERROR",
                            message="Brief processing hiccup — stay on this step and keep your hand visible.",
                            severity="warning",
                        )
                    ],
                )
                out = sanitize_for_json(fallback.model_dump())
                text = json.dumps(
                    out, separators=(",", ":"), ensure_ascii=False, allow_nan=False
                )
                await websocket.send_text(text)
    except WebSocketDisconnect:
        SESSIONS.pop(session_key, None)
        return
