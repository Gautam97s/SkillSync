"""
Thin SQLite wrapper for SkillSync session persistence.

Usage:
    from app.core.database import get_db
    db = get_db()          # returns the singleton Database
    db.execute(sql, params)
    rows = db.fetch_all(sql, params)
"""

from __future__ import annotations

import os
import sqlite3
from typing import Any


_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS students (
    id   TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id      TEXT    NOT NULL,
    procedure_id    TEXT    NOT NULL,
    difficulty      TEXT    NOT NULL DEFAULT 'beginner',
    completed_at    TEXT    DEFAULT (datetime('now')),
    final_score     REAL    DEFAULT 0.0,
    duration_ms     INTEGER DEFAULT 0,
    attempt_count   INTEGER DEFAULT 0,
    avg_hesitation_ms REAL  DEFAULT 0.0,
    tremor_score    REAL    DEFAULT 0.0,
    passed          INTEGER DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id)
);
"""

_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "skillsync.db")


class Database:
    """Simple synchronous SQLite wrapper (safe for the sync pipeline)."""

    def __init__(self, path: str = _DB_PATH) -> None:
        self._path = path
        self._conn: sqlite3.Connection | None = None

    # -- lifecycle --------------------------------------------------------

    def connect(self) -> None:
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA_SQL)
        self._conn.commit()

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    # -- helpers ----------------------------------------------------------

    @property
    def conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self.connect()
        return self._conn

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Cursor:
        cursor = self.conn.execute(sql, params)
        self.conn.commit()
        return cursor

    def fetch_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        row = self.conn.execute(sql, params).fetchone()
        return dict(row) if row else None

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        rows = self.conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]


# -- singleton ------------------------------------------------------------

_instance: Database | None = None


def get_db() -> Database:
    global _instance
    if _instance is None:
        _instance = Database()
        _instance.connect()
    return _instance
