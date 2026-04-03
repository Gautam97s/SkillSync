from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.features.realtime_feedback.schemas.request import FrameRequest
from app.features.realtime_feedback.service.pipeline import process_frame

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            request = FrameRequest(**payload)
            response = process_frame(request)
            await websocket.send_json(response.model_dump())
    except WebSocketDisconnect:
        return
