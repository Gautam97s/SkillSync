# GripSense Backend

FastAPI backend scaffold for real-time procedural skill intelligence.

## Run

1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start server:
   ```bash
   uvicorn app.main:app --reload
   ```

## Endpoints

- `GET /` - Root status
- `GET /health` - Health check
- `WS /ws/stream` - Real-time frame processing

## Structure

- `app/features/health` - Health API feature
- `app/features/realtime_feedback` - WebSocket API, schemas, and orchestration for live feedback
- `app/features/hand_tracking` - MediaPipe integration, landmark handling, and feature engineering
- `app/features/procedure_intelligence` - Rules, state machine, scoring, and feedback logic
- `app/core` - App-level settings and core config
- `app/shared` - Shared utilities used across features
