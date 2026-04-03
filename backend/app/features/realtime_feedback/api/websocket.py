from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.service.pipeline import process_frame
from app.features.procedure_intelligence.engine.state_machine import SESSIONS

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    session_key = str(uuid4())
    try:
        while True:
            payload = await websocket.receive_json()
            request = FrameRequest(**payload)
            response = process_frame(request, session_key=session_key)
            await websocket.send_json(response.model_dump())
    except WebSocketDisconnect:
        SESSIONS.pop(session_key, None)
        return
