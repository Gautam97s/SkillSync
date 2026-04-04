"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";
import CameraFeed from "../features/hand-tracking/components/CameraFeed";
import HandOverlay from "../features/hand-tracking/components/HandOverlay";
import { useTelemetry } from "../shared/contexts/TelemetryContext";
import type { DecayPrediction } from "../shared/lib/types";

const LiveStage = dynamic(
  () => import("../features/hand-tracking/components/LiveStage"),
  {
    ssr: false,
    loading: () => (
      <div className="hand-stage">
        <div className="stage-empty stage-empty--static">
          Preparing live camera view...
        </div>
      </div>
    ),
  }
);

type OverlayVariant = "good" | "warn" | "bad";
type Difficulty = "beginner" | "intermediate";

/* =========================
   STATE + TELEMETRY
========================= */

export default function HomePage() {
  const { connected, latest, send, setDifficulty: setEngineDifficulty } =
    useTelemetry();

  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const difficultyRef = useRef<Difficulty>("beginner");

  const [studentId, setStudentId] = useState("");
  const studentIdRef = useRef("");
  const [studentConfirmed, setStudentConfirmed] = useState(false);

  const [decay, setDecay] = useState<DecayPrediction | null>(null);

  const landmarksRef = useRef<any[]>([]);
  const frameCounter = useRef(0);

  /* =========================
     BACKEND CALLS
  ========================= */

  const fetchDecay = useCallback(async (sid: string) => {
    if (!sid) return;
    try {
      const res = await fetch(
        `http://localhost:8000/api/students/${encodeURIComponent(sid)}/decay`
      );
      if (res.ok) {
        const data: DecayPrediction = await res.json();
        setDecay(data);
      }
    } catch {}
  }, []);

  const confirmStudent = useCallback(async () => {
    const sid = studentId.trim().toLowerCase();
    if (!sid) return;

    studentIdRef.current = sid;
    setStudentConfirmed(true);

    try {
      await fetch("http://localhost:8000/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: sid }),
      });
    } catch {}

    fetchDecay(sid);
  }, [studentId, fetchDecay]);

  /* =========================
     EFFECTS
  ========================= */

  useEffect(() => {
    difficultyRef.current = difficulty;
    setEngineDifficulty(difficulty);
  }, [difficulty, setEngineDifficulty]);

  useEffect(() => {
    if (!connected) return;

    let intervalId: number | null = null;

    const sendFrame = () => {
      send({
        frame_id: frameCounter.current,
        timestamp_ms: Date.now(),
        landmarks: landmarksRef.current,
        procedure_id: "surgical_knot_tying",
        difficulty: difficultyRef.current,
        student_id: studentIdRef.current || "anonymous",
      });
      frameCounter.current++;
    };

    const start = () => {
      if (intervalId !== null) return;
      sendFrame();
      intervalId = window.setInterval(sendFrame, 100);
    };

    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibility = () => {
      document.visibilityState === "visible" ? start() : stop();
    };

    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [connected, send]);

  /* =========================
     DERIVED UI DATA
  ========================= */

  const scorePercent = Math.round((latest?.score ?? 0) * 100);

  const fatigueScorePercent = Math.round(
    (latest?.fatigue?.fatigue_score ?? 0) * 100
  );

  const fatigueLevel = (latest?.fatigue?.fatigue_level ?? "fresh").toUpperCase();

  const primaryFeedback =
    latest?.feedback?.[0]?.message ??
    "Hold position for 3 seconds to confirm joint stability.";

  /* =========================
     UI
  ========================= */

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-area">
          <h1 className="brand-name">SkillSync</h1>
        </div>

        <div className="session-pill">
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={studentConfirmed}
          />
          <button onClick={confirmStudent}>
            {studentConfirmed ? "Session Active" : "Start Session"}
          </button>
        </div>
      </header>

      <section className="content-grid">
        <section className="viewer-panel">
          <LiveStage connected={connected} overlayVariant="good" />
        </section>

        <aside className="insights-panel">
          <div className="metric-card">
            <p>{scorePercent}%</p>
            <p>Grip Stability</p>
          </div>

          <div className="metric-card">
            <p>{fatigueScorePercent}%</p>
            <p>{fatigueLevel}</p>
          </div>

          {decay && (
            <div className="decay-card">
              <p>{Math.round(decay.current_competency * 100)}%</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}