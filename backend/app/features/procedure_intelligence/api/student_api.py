"""REST API for student management, session history, and decay predictions."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.features.procedure_intelligence.engine.decay_predictor import predict_decay


router = APIRouter(prefix="/api", tags=["students"])


# ── Request / Response schemas ──────────────────────────────────────────

class CreateStudentRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=100)


class StudentResponse(BaseModel):
    id: str
    created_at: str | None = None


class SessionResponse(BaseModel):
    id: int
    procedure_id: str
    difficulty: str
    completed_at: str | None
    final_score: float
    duration_ms: int
    attempt_count: int
    avg_hesitation_ms: float
    tremor_score: float
    passed: bool


class DecayResponse(BaseModel):
    student_id: str
    total_sessions: int
    last_session_date: str | None
    last_score: float
    decay_rate: float
    current_competency: float
    projected_decay_date: str | None
    days_until_decay: float | None
    refresher_date: str | None
    refresher_needed: bool


# ── Endpoints ───────────────────────────────────────────────────────────

@router.post("/students", response_model=StudentResponse)
def create_or_get_student(body: CreateStudentRequest) -> dict:
    db = get_db()
    student_id = body.student_id.strip().lower()

    existing = db.fetch_one("SELECT id, created_at FROM students WHERE id = ?", (student_id,))
    if existing:
        return existing

    db.execute("INSERT INTO students (id) VALUES (?)", (student_id,))
    new = db.fetch_one("SELECT id, created_at FROM students WHERE id = ?", (student_id,))
    return new or {"id": student_id, "created_at": None}


@router.get("/students/{student_id}/sessions", response_model=list[SessionResponse])
def get_sessions(student_id: str) -> list[dict]:
    db = get_db()
    sessions = db.fetch_all(
        """
        SELECT id, procedure_id, difficulty, completed_at,
               final_score, duration_ms, attempt_count,
               avg_hesitation_ms, tremor_score, passed
        FROM sessions
        WHERE student_id = ?
        ORDER BY completed_at DESC
        LIMIT 50
        """,
        (student_id.strip().lower(),),
    )
    return sessions


@router.get("/students/{student_id}/decay", response_model=DecayResponse)
def get_decay_prediction(student_id: str) -> dict:
    return predict_decay(student_id.strip().lower())
