"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import CameraFeed from "../features/hand-tracking/components/CameraFeed";
import HandOverlay from "../features/hand-tracking/components/HandOverlay";
// import ProtractorGuidance from "../features/hand-tracking/components/ProtractorGuidance";
import { useTelemetry } from "../shared/contexts/TelemetryContext";
import type { DecayPrediction, SessionRecord } from "../shared/lib/types";

type LandmarksDetail = {
  landmarks?: number[][];
};

type OverlayVariant = "good" | "warn" | "bad";
type Difficulty = "beginner" | "intermediate";

const ANGLE_RANGES: Record<Difficulty, { incision: [number, number]; cutting: [number, number] }> = {
  beginner:     { incision: [60, 120], cutting: [30, 60] },
  intermediate: { incision: [70, 110], cutting: [30, 45] },
};

function evaluateMax(
  value: number | undefined,
  max: number,
  warnSlack: number,
): OverlayVariant {
  if (typeof value !== "number") {
    return "warn";
  }
  if (value <= max) {
    return "good";
  }
  if (value <= max + warnSlack) {
    return "warn";
  }
  return "bad";
}

function evaluateRange(
  value: number | undefined,
  min: number,
  max: number,
  warnSlack: number,
): OverlayVariant {
  if (typeof value !== "number") {
    return "warn";
  }
  if (value >= min && value <= max) {
    return "good";
  }
  if (value >= min - warnSlack && value <= max + warnSlack) {
    return "warn";
  }
  return "bad";
}

function mergeVariant(states: OverlayVariant[]): OverlayVariant {
  if (states.includes("bad")) {
    return "bad";
  }
  if (states.includes("warn")) {
    return "warn";
  }
  return "good";
}

function getStepOverlayVariant(
  stepId: string | undefined,
  angles: Record<string, number> | undefined,
  distances: Record<string, number> | undefined,
  difficulty: Difficulty,
): OverlayVariant {
  if (!stepId) {
    return "warn";
  }

  const { incision, cutting } = ANGLE_RANGES[difficulty];

  switch (stepId) {
    case "thumb_index_precision_grip":
      return evaluateMax(distances?.thumb_index_over_palm, 0.35, 0.1);

    case "middle_finger_support": {
      const checks: OverlayVariant[] = [
        evaluateMax(distances?.index_middle_over_palm, 0.6, 0.12),
        evaluateMax(angles?.index_middle_alignment, 75, 15),
      ];
      return mergeVariant(checks);
    }

    case "initial_incision_position":
      return evaluateRange(angles?.wrist_index_angle, incision[0], incision[1], 10);

    case "cutting_angle_control":
      return evaluateRange(angles?.wrist_index_angle, cutting[0], cutting[1], 10);

    case "grip_stability": {
      const checks: OverlayVariant[] = [
        evaluateRange(angles?.wrist_index_angle, cutting[0], cutting[1], 10),
        evaluateMax(distances?.thumb_index_over_palm, 0.35, 0.1),
        evaluateMax(distances?.index_middle_over_palm, 0.6, 0.12),
      ];
      return mergeVariant(checks);
    }

    case "completed":
      return "good";

    default:
      return "warn";
  }
}

/** Format ISO timestamps from the API for schedule labels (decay / refresher). */
function formatRetentionDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function HomePage() {
  const { connected, reconnecting, latest, send } = useTelemetry();
  const frameCounter = useRef(0);
  const landmarksRef = useRef<number[][]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const difficultyRef = useRef<Difficulty>("beginner");
  const [studentId, setStudentId] = useState("");
  const studentIdRef = useRef("");
  const [studentConfirmed, setStudentConfirmed] = useState(false);
  const [decay, setDecay] = useState<DecayPrediction | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [decayLoading, setDecayLoading] = useState(false);
  const [decayFetchFailed, setDecayFetchFailed] = useState(false);
  const prevStepRef = useRef<string | undefined>(undefined);

  /** Load decay model + raw session rows from SQLite for this learner. */
  const loadUserDbData = useCallback(async (sid: string) => {
    if (!sid) return;
    setDecayFetchFailed(false);
    setDecayLoading(true);
    try {
      const decayUrl = `http://localhost:8000/api/students/${encodeURIComponent(sid)}/decay`;
      const sessionsUrl = `http://localhost:8000/api/students/${encodeURIComponent(sid)}/sessions`;
      const [decayRes, sessionsRes] = await Promise.all([
        fetch(decayUrl),
        fetch(sessionsUrl),
      ]);
      if (decayRes.ok) {
        const data: DecayPrediction = await decayRes.json();
        setDecay(data);
      } else {
        setDecay(null);
      }
      if (sessionsRes.ok) {
        const rows: SessionRecord[] = await sessionsRes.json();
        setSessions(Array.isArray(rows) ? rows : []);
      } else {
        setSessions([]);
      }
      setDecayFetchFailed(!decayRes.ok);
    } catch {
      setDecayFetchFailed(true);
      setDecay(null);
      setSessions([]);
    } finally {
      setDecayLoading(false);
    }
  }, []);

  const confirmStudent = useCallback(async () => {
    const sid = studentId.trim().toLowerCase();
    if (!sid) return;
    studentIdRef.current = sid;
    prevStepRef.current = undefined;
    setStudentConfirmed(true);
    // Create student in DB
    try {
      await fetch("http://localhost:8000/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: sid }),
      });
    } catch { /* ignore */ }
    loadUserDbData(sid);
  }, [studentId, loadUserDbData]);

  useEffect(() => {
    const handleLandmarks = (event: Event) => {
      const customEvent = event as CustomEvent<LandmarksDetail>;
      const points = customEvent.detail?.landmarks;
      if (Array.isArray(points)) {
        landmarksRef.current = points;
      }
    };

    window.addEventListener("skillsync:landmarks", handleLandmarks);
    return () => {
      window.removeEventListener("skillsync:landmarks", handleLandmarks);
    };
  }, []);

  useEffect(() => {
    if (!connected || !studentConfirmed || !studentIdRef.current) {
      return;
    }

    // Keep scoring updates smooth without re-rendering the whole page at camera FPS.
    // We send at ~10fps while visible, and immediately send once on tab refocus.
    let intervalId: number | null = null;

    const sendFrame = () => {
      const now = Date.now();
      send({
        frame_id: frameCounter.current,
        timestamp_ms: now,
        landmarks: landmarksRef.current,
        procedure_id: "surgical_knot_tying",
        difficulty: difficultyRef.current,
        student_id: studentIdRef.current || "anonymous",
      });
      frameCounter.current += 1;
    };

    const start = () => {
      if (intervalId !== null) {
        return;
      }
      sendFrame();
      intervalId = window.setInterval(sendFrame, 100);
    };

    const stop = () => {
      if (intervalId === null) {
        return;
      }
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [connected, send, studentConfirmed]);

  // Score + joint readouts: smooth **display only** (skeleton overlay stays raw / in sync with camera).
  const scoreEmaRef = useRef(0.942);
  const displayScoreRef = useRef(94);
  /** Smoothed targets (EMA on server angles) — display lerps toward these in rAF. */
  const angleEmaRef = useRef<{ mcp: number | null; pip: number | null }>({
    mcp: null,
    pip: null,
  });
  const angleTargetsRef = useRef<{ mcp: number | null; pip: number | null }>({
    mcp: null,
    pip: null,
  });
  const angleDisplayRef = useRef({ mcp: 0, pip: 0 });
  const [displayScorePercent, setDisplayScorePercent] = useState(94);
  const [displayAngles, setDisplayAngles] = useState({ mcp: 0, pip: 0 });

  useEffect(() => {
    if (Array.isArray(latest?.landmarks) && latest.landmarks.length === 0) {
      scoreEmaRef.current = 0;
      displayScoreRef.current = 0;
      setDisplayScorePercent(0);
      return;
    }

    if (latest?.score !== undefined) {
      const s = latest.score;
      scoreEmaRef.current =
        scoreEmaRef.current * 0.97 + Math.max(0, Math.min(1, s)) * 0.03;
    }
  }, [latest?.score]);

  useEffect(() => {
    if (Array.isArray(latest?.landmarks) && latest.landmarks.length === 0) {
      angleEmaRef.current = { mcp: 0, pip: 0 };
      angleTargetsRef.current = { mcp: 0, pip: 0 };
      angleDisplayRef.current = { mcp: 0, pip: 0 };
      setDisplayAngles({ mcp: 0, pip: 0 });
      return;
    }

    const a = latest?.angles;
    if (!a) {
      return;
    }
    // Calm noisy angle streams: heavy EMA on raw readings before display interpolation.
    const NEW_WEIGHT = 0.085;
    const blend = (prev: number | null, reading: number) =>
      prev === null ? reading : prev * (1 - NEW_WEIGHT) + reading * NEW_WEIGHT;

    if (typeof a.mcp_joint === "number") {
      angleEmaRef.current.mcp = blend(angleEmaRef.current.mcp, a.mcp_joint);
      angleTargetsRef.current.mcp = angleEmaRef.current.mcp;
    }
    if (typeof a.pip_joint === "number") {
      angleEmaRef.current.pip = blend(angleEmaRef.current.pip, a.pip_joint);
      angleTargetsRef.current.pip = angleEmaRef.current.pip;
    }
  }, [latest?.angles]);

  useEffect(() => {
    let raf = 0;
    /** Per-frame lerp toward smoothed target (lower = calmer numbers). */
    const ANGLE_RATE = 0.052;
    const ANGLE_SNAP_DEG = 0.18;
    const tick = () => {
      const target = Math.max(
        0,
        Math.min(100, Math.round(scoreEmaRef.current * 100)),
      );
      const prev = displayScoreRef.current;
      const next = prev + (target - prev) * 0.045;
      displayScoreRef.current =
        Math.abs(target - next) < 0.25 ? target : next;
      setDisplayScorePercent(Math.round(displayScoreRef.current));

      let { mcp: mcpD, pip: pipD } = angleDisplayRef.current;
      const tm = angleTargetsRef.current.mcp;
      const tp = angleTargetsRef.current.pip;
      if (tm !== null) {
        mcpD = mcpD + (tm - mcpD) * ANGLE_RATE;
        if (Math.abs(tm - mcpD) < ANGLE_SNAP_DEG) {
          mcpD = tm;
        }
      }
      if (tp !== null) {
        pipD = pipD + (tp - pipD) * ANGLE_RATE;
        if (Math.abs(tp - pipD) < ANGLE_SNAP_DEG) {
          pipD = tp;
        }
      }
      angleDisplayRef.current = { mcp: mcpD, pip: pipD };
      setDisplayAngles({
        mcp: Math.round(mcpD * 10) / 10,
        pip: Math.round(pipD * 10) / 10,
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scorePercent = displayScorePercent;
  const primaryFeedback = latest?.feedback?.[0]?.message ?? "Hold position for 3 seconds to confirm joint stability.";

  // Decay from WebSocket the moment a session is persisted; refresh session list from DB.
  useEffect(() => {
    const sd = latest?.skill_decay;
    if (!sd) return;
    setDecay(sd);
    setDecayFetchFailed(false);
    const sid = studentIdRef.current;
    if (!sid) return;
    void fetch(`http://localhost:8000/api/students/${encodeURIComponent(sid)}/sessions`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: SessionRecord[]) => {
        setSessions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
  }, [latest?.skill_decay]);

  // `session_saved` is only true for a single frame — refetch when we actually enter "completed"
  // so the DB-backed decay/refresher dates always load in the bottom panel.
  useEffect(() => {
    const step = latest?.step;
    const sid = studentIdRef.current;
    if (!sid || !studentConfirmed) {
      prevStepRef.current = step;
      return;
    }
    const enteredCompleted = step === "completed" && prevStepRef.current !== "completed";
    prevStepRef.current = step;
    if (enteredCompleted) {
      loadUserDbData(sid);
    }
  }, [latest?.step, studentConfirmed, loadUserDbData]);

  // Extra backup when the server flags persistence (older clients / missed transition).
  useEffect(() => {
    if (latest?.session_saved && studentIdRef.current) {
      loadUserDbData(studentIdRef.current);
    }
  }, [latest?.session_saved, loadUserDbData]);

  const stepDescriptions: Record<string, string> = {
    thumb_index_precision_grip: "Keep thumb and index finger close for precision grip.",
    middle_finger_support: "Use middle finger as supporting finger near index.",
    initial_incision_position: "Start with near-perpendicular tool orientation.",
    cutting_angle_control: "Maintain controlled cutting angle during motion.",
    grip_stability: "Hold the validated grip steadily.",
    completed: "Procedure completed successfully.",
  };

  const procedureSteps = latest?.procedure_steps || [
    { id: "grip_init", dwell_time_ms: 700 },
    { id: "hold_steady", dwell_time_ms: 3000 },
    { id: "completed", dwell_time_ms: 0 },
  ];
  const effectiveStepId = latest?.reset ? procedureSteps[0]?.id : latest?.step;
  const overlayVariant = getStepOverlayVariant(
    effectiveStepId,
    latest?.angles,
    latest?.distances,
    difficulty,
  );
  const currentStepIndex = procedureSteps.findIndex((s) => s.id === effectiveStepId);
  const showCompletionSchedule =
    effectiveStepId === "completed" && Boolean(decay && decay.total_sessions > 0);

  const steps = procedureSteps.map((step, index) => {

    let state: "pending" | "active" | "done" = "pending";
    if (effectiveStepId === step.id) {
      state = step.id === "completed" ? "done" : "active";
    } else if (index < currentStepIndex) {
      state = "done";
    }

    return {
      title: step.id
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      detail: stepDescriptions[step.id] || `Step ${index + 1}`,
      state,
    };
  });

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-area">
          <h1 className="brand-name">SkillSync</h1>
          <nav className="top-nav" aria-label="Primary navigation">
            <a className="top-nav-link active" href="#">
              Dashboard
            </a>
            <a className="top-nav-link" href="#">
              Analytics
            </a>
            <a className="top-nav-link" href="#">
              Procedures
            </a>
          </nav>
        </div>
        <div className="top-actions">
          <div className="search-pill">Search data...</div>
          <button className="icon-btn" aria-label="Notifications">
            N
          </button>
          <button className="icon-btn" aria-label="Settings">
            S
          </button>
          <div className="avatar">{studentConfirmed ? studentId.slice(0, 2).toUpperCase() : "GH"}</div>
        </div>
      </header>

      {!studentConfirmed && (
        <div className="student-bar">
          <div className="student-bar-inner">
            <span className="student-bar-icon">👤</span>
            <input
              id="student-name-input"
              className="student-input"
              type="text"
              placeholder="Enter your name to start tracking..."
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmStudent(); }}
            />
            <button className="student-btn" onClick={confirmStudent} disabled={!studentId.trim()}>
              Start Session
            </button>
          </div>
        </div>
      )}

      <section className="content-grid">
        <section className="viewer-panel">
          <div className="viewer-badges">
            <span className="badge badge-live">{connected ? "LIVE TRACKING" : "OFFLINE"}</span>
            <span className="badge badge-stream">FHD STREAM</span>

            <div className="diff-inline" role="radiogroup" aria-label="Difficulty level">
              <button
                id="difficulty-beginner"
                className={`diff-pill ${difficulty === "beginner" ? "diff-pill--active" : ""}`}
                onClick={() => { setDifficulty("beginner"); difficultyRef.current = "beginner"; }}
                aria-pressed={difficulty === "beginner"}
              >
                🟢 Beginner
              </button>
              <button
                id="difficulty-intermediate"
                className={`diff-pill ${difficulty === "intermediate" ? "diff-pill--active" : ""}`}
                onClick={() => { setDifficulty("intermediate"); difficultyRef.current = "intermediate"; }}
                aria-pressed={difficulty === "intermediate"}
              >
                🔶 Intermediate
              </button>
            </div>
          </div>

          <div className="hand-stage" aria-label="Live hand stage">
            <div className="stage-glow" />
            <CameraFeed compact />
            <HandOverlay variant={overlayVariant} />
            {/* <ProtractorGuidance targetAngleDeg={90} toleranceDeg={12} softBandDeg={20} /> */}
            {!connected && (
              <div className="stage-empty">
                {reconnecting
                  ? "Reconnecting to live scoring…"
                  : "Waiting for backend websocket…"}
              </div>
            )}

            <div className="status-card status-card--stage">
              <div className="status-icon">A</div>
              <div>
                <p className="status-title">AI Calibration Active</p>
                <p className="status-subtitle">{primaryFeedback}</p>
              </div>
              <div className="status-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>

        <aside className="insights-panel" aria-label="Live metrics and retention">
          <article className="metric-card">
            <div className="metric-head">
              <span className="metric-icon">B</span>
              <span className="metric-chip">OPTIMAL</span>
            </div>
            <p className="metric-value">
              {scorePercent}
              <span>%</span>
            </p>
            <p className="metric-label">Grip Stability Confidence Score</p>
            <div className="progress-track">
              <span style={{ width: `${scorePercent}%` }} />
            </div>
          </article>

          <article className="angles-card">
            <h2>Joint Angles</h2>
            <div className="angles-grid">
              <div>
                <p>MCP JOINT</p>
                <strong>{displayAngles.mcp.toFixed(1)} deg</strong>
              </div>
              <div>
                <p>PIP JOINT</p>
                <strong>{displayAngles.pip.toFixed(1)} deg</strong>
              </div>
            </div>
          </article>


          <article className="steps-card">
            <div className="steps-head">
              <h2>Procedure Steps</h2>
              <span>
                STEP {Math.max(1, currentStepIndex + 1)} OF {procedureSteps.length}
              </span>
            </div>
            <ul className="steps-list">
              {steps.map((step) => (
                <li key={step.title} className={`step-row ${step.state}`}>
                  <span className="step-dot" aria-hidden="true" />
                  <div>
                    <p>{step.title}</p>
                    <small>{step.detail}</small>
                  </div>
                </li>
              ))}
            </ul>
          </article>

          {studentConfirmed && (
            <article className="decay-card decay-card--anchored">
              <div className="decay-head">
                <div>
                  <h2>Your data (from database)</h2>
                  <p className="decay-user-tag">Learner: {studentId || studentIdRef.current}</p>
                </div>
                {decay && decay.total_sessions > 0 && decay.refresher_needed && (
                  <span className="refresher-badge">⚠️ REFRESHER NEEDED</span>
                )}
              </div>
              {decayLoading && sessions.length === 0 && !decay && (
                <p className="decay-empty">Loading your history from the database…</p>
              )}
              {decayFetchFailed && !decay && !decayLoading && (
                <p className="decay-empty decay-empty--error">
                  Could not load your data. Check that the API is running at{" "}
                  <code className="decay-code">localhost:8000</code> and try again.
                </p>
              )}
              {sessions.length > 0 && (
                <div className="session-db-section">
                  <p className="session-db-headline">
                    <strong>{sessions.length}</strong> completed procedure
                    {sessions.length === 1 ? "" : "s"} on file for this learner (SQLite).
                  </p>
                  <ul className="session-db-list" aria-label="Past sessions from database">
                    {sessions.slice(0, 10).map((s) => (
                      <li key={s.id} className="session-db-item">
                        <div className="session-db-item-main">
                          <span>{formatRetentionDate(s.completed_at)}</span>
                          <strong>{Math.round(s.final_score * 100)}% score</strong>
                        </div>
                        <div className="session-db-item-sub">
                          {s.procedure_id} · {s.difficulty}
                          {s.passed === false ? " · not passed" : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {decay && decay.total_sessions > 0 && (
                <>
                  {showCompletionSchedule && (
                    <div className="completion-schedule-banner" role="status" aria-live="polite">
                      <p className="completion-schedule-title">Procedure complete — your retention schedule</p>
                      <dl className="completion-schedule-dates">
                        <div className="completion-schedule-block">
                          <dt>Projected decay date</dt>
                          <dd title={decay.projected_decay_date ?? undefined}>
                            {formatRetentionDate(decay.projected_decay_date)}
                          </dd>
                          <p className="completion-schedule-hint">
                            Estimated day competency may fall below the practice threshold.
                          </p>
                        </div>
                        <div className="completion-schedule-block">
                          <dt>Refresher date</dt>
                          <dd title={decay.refresher_date ?? undefined}>
                            {formatRetentionDate(decay.refresher_date)}
                          </dd>
                          <p className="completion-schedule-hint">
                            Aim to review before this date to stay ahead of decay.
                          </p>
                        </div>
                      </dl>
                    </div>
                  )}
                  <div className="decay-grid">
                    <div className="decay-stat">
                      <span className="decay-stat-value">{Math.round(decay.current_competency * 100)}%</span>
                      <span className="decay-stat-label">Current Competency</span>
                    </div>
                    <div className="decay-stat">
                      <span className="decay-stat-value">{decay.total_sessions}</span>
                      <span className="decay-stat-label">Total Sessions</span>
                    </div>
                  </div>
                  <div className="decay-details">
                    {!showCompletionSchedule && (
                      <>
                        <div className="decay-row">
                          <span>Projected decay date</span>
                          <strong>{formatRetentionDate(decay.projected_decay_date)}</strong>
                        </div>
                        <div className="decay-row">
                          <span>Refresher date</span>
                          <strong>{formatRetentionDate(decay.refresher_date)}</strong>
                        </div>
                      </>
                    )}
                    {decay.days_until_decay !== null && (
                      <div className="decay-row">
                        <span>Days until projected decay</span>
                        <strong>
                          {decay.days_until_decay > 0 ? `${Math.ceil(decay.days_until_decay)} days` : "Now"}
                        </strong>
                      </div>
                    )}
                    {decay.last_session_date && (
                      <div className="decay-row">
                        <span>Last session</span>
                        <strong>{formatRetentionDate(decay.last_session_date)}</strong>
                      </div>
                    )}
                    <div className="decay-row">
                      <span>Decay rate (λ)</span>
                      <strong>{(decay.decay_rate * 100).toFixed(1)}%/day</strong>
                    </div>
                  </div>
                  <div className="decay-bar-track">
                    <div className="decay-bar-fill" style={{ width: `${Math.round(decay.current_competency * 100)}%` }} />
                    <div className="decay-threshold" />
                  </div>
                </>
              )}
              {!decayLoading &&
                !decayFetchFailed &&
                sessions.length === 0 &&
                (!decay || decay.total_sessions === 0) && (
                  <p className="decay-empty" style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>
                    Enter your name and complete a full procedure once. Your runs are saved per learner so we can
                    show session count, decay date, and refresher date here.
                  </p>
                )}
            </article>
          )}
        </aside>
      </section>
    </main>
  );
}
