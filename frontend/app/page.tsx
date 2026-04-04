"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import CameraFeed from "../features/hand-tracking/components/CameraFeed";
import HandOverlay from "../features/hand-tracking/components/HandOverlay";
import { useTelemetry } from "../shared/contexts/TelemetryContext";
import { API_BASE_URL } from "../shared/lib/constants";
import type { DecayPrediction, SessionRecord } from "../shared/lib/types";

type LandmarksDetail = {
  landmarks?: number[][];
};

type OverlayVariant = "good" | "warn" | "bad";
type Difficulty = "beginner" | "intermediate";
type TabKey = "dashboard" | "analytics" | "procedures";

const ANGLE_RANGES: Record<Difficulty, { incision: [number, number]; cutting: [number, number] }> = {
  beginner: { incision: [60, 120], cutting: [30, 60] },
  intermediate: { incision: [70, 110], cutting: [30, 45] },
};

function evaluateMax(value: number | undefined, max: number, warnSlack: number): OverlayVariant {
  if (typeof value !== "number") return "warn";
  if (value <= max) return "good";
  if (value <= max + warnSlack) return "warn";
  return "bad";
}

function evaluateRange(value: number | undefined, min: number, max: number, warnSlack: number): OverlayVariant {
  if (typeof value !== "number") return "warn";
  if (value >= min && value <= max) return "good";
  if (value >= min - warnSlack && value <= max + warnSlack) return "warn";
  return "bad";
}

function mergeVariant(states: OverlayVariant[]): OverlayVariant {
  if (states.includes("bad")) return "bad";
  if (states.includes("warn")) return "warn";
  return "good";
}

function getStepOverlayVariant(
  stepId: string | undefined,
  angles: Record<string, number> | undefined,
  distances: Record<string, number> | undefined,
  difficulty: Difficulty,
): OverlayVariant {
  if (!stepId) return "warn";
  const { incision, cutting } = ANGLE_RANGES[difficulty];

  switch (stepId) {
    case "thumb_index_precision_grip":
      return evaluateMax(distances?.thumb_index_over_palm, 0.35, 0.1);
    case "middle_finger_support":
      return mergeVariant([
        evaluateMax(distances?.index_middle_over_palm, 0.6, 0.12),
        evaluateMax(angles?.index_middle_alignment, 75, 15),
      ]);
    case "initial_incision_position":
      return evaluateRange(angles?.wrist_index_angle, incision[0], incision[1], 10);
    case "cutting_angle_control":
      return evaluateRange(angles?.wrist_index_angle, cutting[0], cutting[1], 10);
    case "grip_stability":
      return mergeVariant([
        evaluateRange(angles?.wrist_index_angle, cutting[0], cutting[1], 10),
        evaluateMax(distances?.thumb_index_over_palm, 0.35, 0.1),
        evaluateMax(distances?.index_middle_over_palm, 0.6, 0.12),
      ]);
    case "completed":
      return "good";
    default:
      return "warn";
  }
}

function formatRetentionDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatProcedureLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildScorePath(scores: number[], width: number, height: number): string {
  if (scores.length === 0) return "";
  if (scores.length === 1) {
    const y = height - (scores[0] / 100) * height;
    return `M 0 ${y} L ${width} ${y}`;
  }
  return scores
    .map((score, index) => {
      const x = (index / (scores.length - 1)) * width;
      const y = height - (score / 100) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatDaysUntilDecay(days: number | null | undefined): string {
  if (days === null || days === undefined) {
    return "Pending";
  }

  const normalized = Math.max(0, Math.trunc(days));
  if (normalized === 0) {
    return "Due now";
  }

  return `${normalized} day${normalized === 1 ? "" : "s"}`;
}

function formatSessionDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s duration`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s duration`;
}

export default function HomePage() {
  const { connected, reconnecting, latest, send } = useTelemetry();
  const frameCounter = useRef(0);
  const landmarksRef = useRef<number[][]>([]);
  const [mounted, setMounted] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const difficultyRef = useRef<Difficulty>("beginner");
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [studentId, setStudentId] = useState("");
  const studentIdRef = useRef("");
  const [studentConfirmed, setStudentConfirmed] = useState(false);
  const [decay, setDecay] = useState<DecayPrediction | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [decayLoading, setDecayLoading] = useState(false);
  const [decayFetchFailed, setDecayFetchFailed] = useState(false);
  const prevStepRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadUserDbData = useCallback(async (sid: string) => {
    if (!sid) return;
    setDecayFetchFailed(false);
    setDecayLoading(true);
    try {
      const decayUrl = `${API_BASE_URL}/api/students/${encodeURIComponent(sid)}/decay`;
      const sessionsUrl = `${API_BASE_URL}/api/students/${encodeURIComponent(sid)}/sessions`;
      const [decayRes, sessionsRes] = await Promise.all([fetch(decayUrl), fetch(sessionsUrl)]);
      setDecay(decayRes.ok ? await decayRes.json() : null);
      setSessions(sessionsRes.ok ? await sessionsRes.json() : []);
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
    try {
      await fetch(`${API_BASE_URL}/api/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: sid }),
      });
    } catch {}
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
    return () => window.removeEventListener("skillsync:landmarks", handleLandmarks);
  }, []);

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
      frameCounter.current += 1;
    };

    const start = () => {
      if (intervalId !== null) return;
      sendFrame();
      intervalId = window.setInterval(sendFrame, 100);
    };

    const stop = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [connected, send]);

  const scoreEmaRef = useRef(0.942);
  const displayScoreRef = useRef(94);
  const angleEmaRef = useRef<{ mcp: number | null; pip: number | null }>({ mcp: null, pip: null });
  const angleTargetsRef = useRef<{ mcp: number | null; pip: number | null }>({ mcp: null, pip: null });
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
      scoreEmaRef.current = scoreEmaRef.current * 0.97 + Math.max(0, Math.min(1, latest.score)) * 0.03;
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

    const angles = latest?.angles;
    if (!angles) return;
    const newWeight = 0.085;
    const blend = (prev: number | null, reading: number) =>
      prev === null ? reading : prev * (1 - newWeight) + reading * newWeight;

    if (typeof angles.mcp_joint === "number") {
      angleEmaRef.current.mcp = blend(angleEmaRef.current.mcp, angles.mcp_joint);
      angleTargetsRef.current.mcp = angleEmaRef.current.mcp;
    }
    if (typeof angles.pip_joint === "number") {
      angleEmaRef.current.pip = blend(angleEmaRef.current.pip, angles.pip_joint);
      angleTargetsRef.current.pip = angleEmaRef.current.pip;
    }
  }, [latest?.angles]);

  useEffect(() => {
    let raf = 0;
    const angleRate = 0.052;
    const angleSnapDeg = 0.18;

    const tick = () => {
      const target = Math.max(0, Math.min(100, Math.round(scoreEmaRef.current * 100)));
      const prev = displayScoreRef.current;
      const next = prev + (target - prev) * 0.045;
      displayScoreRef.current = Math.abs(target - next) < 0.25 ? target : next;
      setDisplayScorePercent(Math.round(displayScoreRef.current));

      let { mcp: mcpD, pip: pipD } = angleDisplayRef.current;
      const tm = angleTargetsRef.current.mcp;
      const tp = angleTargetsRef.current.pip;
      if (tm !== null) {
        mcpD = mcpD + (tm - mcpD) * angleRate;
        if (Math.abs(tm - mcpD) < angleSnapDeg) mcpD = tm;
      }
      if (tp !== null) {
        pipD = pipD + (tp - pipD) * angleRate;
        if (Math.abs(tp - pipD) < angleSnapDeg) pipD = tp;
      }
      angleDisplayRef.current = { mcp: mcpD, pip: pipD };
      setDisplayAngles({ mcp: Math.round(mcpD * 10) / 10, pip: Math.round(pipD * 10) / 10 });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scorePercent = displayScorePercent;
  const fatigueScorePercent = Math.max(
    0,
    Math.min(100, Math.round((latest?.fatigue?.fatigue_score ?? 0) * 100)),
  );
  const fatigueLevel = (latest?.fatigue?.fatigue_level ?? "fresh").toUpperCase();
  const fatigueBreakSeconds = latest?.fatigue?.recommended_break_seconds ?? 0;
  const fatigueNote =
    latest?.fatigue?.warning_message ??
    (fatigueBreakSeconds > 0
      ? `Recommended break: ${fatigueBreakSeconds}s`
      : "Fatigue is under control.");
  const primaryFeedback = latest?.feedback?.[0]?.message ?? "Hold position for 3 seconds to confirm joint stability.";

  useEffect(() => {
    if (!latest?.skill_decay) return;
    setDecay(latest.skill_decay);
    setDecayFetchFailed(false);
    const sid = studentIdRef.current;
    if (!sid) return;
    void fetch(`${API_BASE_URL}/api/students/${encodeURIComponent(sid)}/sessions`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: SessionRecord[]) => setSessions(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [latest?.skill_decay]);

  useEffect(() => {
    const step = latest?.step;
    const sid = studentIdRef.current;
    if (!sid || !studentConfirmed) {
      prevStepRef.current = step;
      return;
    }
    const enteredCompleted = step === "completed" && prevStepRef.current !== "completed";
    prevStepRef.current = step;
    if (enteredCompleted) loadUserDbData(sid);
  }, [latest?.step, studentConfirmed, loadUserDbData]);

  useEffect(() => {
    if (latest?.session_saved && studentIdRef.current) loadUserDbData(studentIdRef.current);
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
  const overlayVariant = getStepOverlayVariant(effectiveStepId, latest?.angles, latest?.distances, difficulty);
  const currentStepIndex = procedureSteps.findIndex((step) => step.id === effectiveStepId);
  const steps = procedureSteps.map((step, index) => {
    let state: "pending" | "active" | "done" = "pending";
    if (effectiveStepId === step.id) state = step.id === "completed" ? "done" : "active";
    else if (index < currentStepIndex) state = "done";
    return {
      title: formatProcedureLabel(step.id),
      detail: stepDescriptions[step.id] || `Step ${index + 1}`,
      state,
    };
  });

  const analytics = useMemo(() => {
    const latestSessions = [...sessions].sort((a, b) => {
      const timeA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const timeB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.id - a.id;
    });
    const chartSessions = latestSessions.slice(0, 8).reverse();
    const chartScores = chartSessions.map((session) => Math.round(Math.max(0, Math.min(1, session.final_score)) * 100));
    const averageScore = latestSessions.length
      ? Math.round((latestSessions.reduce((sum, s) => sum + Math.max(0, Math.min(1, s.final_score)), 0) / latestSessions.length) * 100)
      : 0;
    const bestScore = latestSessions.length
      ? Math.round(Math.max(...latestSessions.map((s) => Math.max(0, Math.min(1, s.final_score)))) * 100)
      : 0;
    const completionRate = latestSessions.length
      ? Math.round((latestSessions.filter((s) => s.passed !== false).length / latestSessions.length) * 100)
      : 0;

    return {
      latestSessions,
      chartSessions,
      chartScores,
      chartPath: buildScorePath(chartScores, 520, 180),
      averageScore,
      bestScore,
      completionRate,
      daysUntilDecay: formatDaysUntilDecay(decay?.days_until_decay),
      analyticsStatus: decay?.refresher_needed ? "Refresher recommended" : decay ? "Retention stable" : "Waiting for data",
    };
  }, [sessions, decay]);

  if (!mounted) {
    return <main className="dashboard-shell" />;
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-area">
          <h1 className="brand-name">SkillSync</h1>
          <nav className="top-nav" aria-label="Primary navigation">
            <button type="button" className={`top-nav-link ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>Dashboard</button>
            <button type="button" className={`top-nav-link ${activeTab === "analytics" ? "active" : ""}`} onClick={() => setActiveTab("analytics")}>Analytics</button>
            <button type="button" className={`top-nav-link ${activeTab === "procedures" ? "active" : ""}`} onClick={() => setActiveTab("procedures")}>Procedures</button>
          </nav>
        </div>
        <div className="top-actions">
          <div className="session-pill">
            <input
              id="student-name-input"
              className="student-input"
              type="text"
              placeholder="Enter your name"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmStudent(); }}
              disabled={studentConfirmed}
            />
            <button className="student-btn" onClick={confirmStudent} disabled={!studentId.trim() || studentConfirmed}>
              {studentConfirmed ? "Session Active" : "Start Session"}
            </button>
          </div>
        </div>
      </header>

      {activeTab === "dashboard" && (
        <section className="content-grid">
          <section className="viewer-panel">
            <div className="viewer-badges">
              <span className="badge badge-live">{connected ? "LIVE TRACKING" : "OFFLINE"}</span>
              <span className="badge badge-stream">FHD STREAM</span>
              <div className="diff-inline" role="radiogroup" aria-label="Difficulty level">
                <button id="difficulty-beginner" className={`diff-pill ${difficulty === "beginner" ? "diff-pill--active" : ""}`} onClick={() => { setDifficulty("beginner"); difficultyRef.current = "beginner"; }} aria-pressed={difficulty === "beginner"}>Beginner</button>
                <button id="difficulty-intermediate" className={`diff-pill ${difficulty === "intermediate" ? "diff-pill--active" : ""}`} onClick={() => { setDifficulty("intermediate"); difficultyRef.current = "intermediate"; }} aria-pressed={difficulty === "intermediate"}>Intermediate</button>
              </div>
            </div>
            <div className="hand-stage" aria-label="Live hand stage">
              <div className="stage-glow" />
              <CameraFeed compact />
              <HandOverlay variant={overlayVariant} />
              {!connected && <div className="stage-empty">{reconnecting ? "Reconnecting to live scoring..." : "Waiting for backend websocket..."}</div>}
              <div className="status-card status-card--stage">
                <div className="status-icon">A</div>
                <div>
                  <p className="status-title">AI Calibration Active</p>
                  <p className="status-subtitle">{primaryFeedback}</p>
                </div>
                <div className="status-bars" aria-hidden="true"><span /><span /><span /></div>
              </div>
            </div>
          </section>

          <aside className="insights-panel" aria-label="Live metrics">
            <article className="metric-card">
              <div className="metric-head"><span className="metric-icon">B</span><span className="metric-chip">OPTIMAL</span></div>
              <p className="metric-value">{scorePercent}<span>%</span></p>
              <p className="metric-label">Grip Stability Confidence Score</p>
              <div className="progress-track"><span style={{ width: `${scorePercent}%` }} /></div>
            </article>

            <article className="metric-card">
              <div className="metric-head"><span className="metric-icon">F</span><span className="metric-chip">{fatigueLevel}</span></div>
              <p className="metric-value">{fatigueScorePercent}<span>%</span></p>
              <p className="metric-label">Fatigue Score</p>
              <div className="progress-track"><span style={{ width: `${fatigueScorePercent}%` }} /></div>
              <p className="metric-note">{fatigueNote}</p>
            </article>

            <article className="angles-card">
              <h2>Joint Angles</h2>
              <div className="angles-grid">
                <div><p>MCP JOINT</p><strong>{displayAngles.mcp.toFixed(1)} deg</strong></div>
                <div><p>PIP JOINT</p><strong>{displayAngles.pip.toFixed(1)} deg</strong></div>
              </div>
            </article>

            <article className="steps-card">
              <div className="steps-head"><h2>Procedure Steps</h2><span>STEP {Math.max(1, currentStepIndex + 1)} OF {procedureSteps.length}</span></div>
              <ul className="steps-list">
                {steps.map((step) => (
                  <li key={step.title} className={`step-row ${step.state}`}>
                    <span className="step-dot" aria-hidden="true" />
                    <div><p>{step.title}</p><small>{step.detail}</small></div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="analytics-preview-card">
              <div className="analytics-preview-head">
                <div>
                  <p className="analytics-preview-label">Analytics Hub</p>
                  <h2>Database intelligence now lives in its own view.</h2>
                </div>
                <button type="button" className="analytics-link-btn" onClick={() => setActiveTab("analytics")}>Open Analytics</button>
              </div>
              <div className="analytics-preview-grid">
                <div><strong>{decay ? `${Math.round(decay.current_competency * 100)}%` : "—"}</strong><span>Competency</span></div>
                <div><strong>{analytics.latestSessions.length}</strong><span>Logged sessions</span></div>
                <div><strong>{analytics.bestScore ? `${analytics.bestScore}%` : "—"}</strong><span>Best run</span></div>
              </div>
            </article>
          </aside>
        </section>
      )}

      {activeTab === "analytics" && (
        <section className="analytics-shell">
          <section className="analytics-hero">
            <div className="analytics-hero-copy">
              <p className="analytics-kicker">Learner Intelligence</p>
              <h2>{studentConfirmed ? `Performance story for ${studentId || studentIdRef.current}` : "Unlock your session intelligence"}</h2>
              <p>A dedicated analytics canvas for retention timing, session quality, score movement, and the full database timeline instead of crowding the live tracking surface.</p>
            </div>
            <div className="analytics-hero-badges">
              <span className="analytics-flag analytics-flag--primary">{analytics.analyticsStatus}</span>
              <span className="analytics-flag">{studentConfirmed ? `${analytics.latestSessions.length} sessions tracked` : "Awaiting learner"}</span>
            </div>
          </section>

          {studentConfirmed ? (
            <>
              <section className="analytics-grid">
                <article className="analytics-card analytics-card--spotlight">
                  <div className="analytics-card-head">
                    <div>
                      <p className="analytics-card-label">Retention Pulse</p>
                      <h3>{decay ? `${Math.round(decay.current_competency * 100)}% competency` : "No retention model yet"}</h3>
                    </div>
                    {decay?.refresher_needed && <span className="refresher-badge">REFRESHER DUE</span>}
                  </div>
                  <div className="pulse-meter"><div className="pulse-meter-fill" style={{ width: `${decay ? Math.round(decay.current_competency * 100) : 0}%` }} /><div className="pulse-meter-threshold" /></div>
                  <div className="analytics-stat-row">
                    <div className="analytics-stat-block"><span>Projected decay</span><strong>{formatRetentionDate(decay?.projected_decay_date)}</strong></div>
                    <div className="analytics-stat-block"><span>Refresher plan</span><strong>{formatRetentionDate(decay?.refresher_date)}</strong></div>
                  </div>
                  <div className="analytics-mini-grid">
                    <div className="analytics-mini-card"><span>Days until decay</span><strong>{analytics.daysUntilDecay}</strong></div>
                    <div className="analytics-mini-card"><span>Decay rate</span><strong>{decay ? `${(decay.decay_rate * 100).toFixed(1)}%/day` : "—"}</strong></div>
                    <div className="analytics-mini-card"><span>Last session</span><strong>{formatShortDate(decay?.last_session_date)}</strong></div>
                  </div>
                </article>

                <article className="analytics-card analytics-card--scoreboard">
                  <div className="analytics-card-head">
                    <div><p className="analytics-card-label">Session Scoreboard</p><h3>Latest outcomes in sequence</h3></div>
                  </div>
                  <div className="scoreboard-grid">
                    <div className="scoreboard-tile"><span>Average</span><strong>{analytics.averageScore}%</strong></div>
                    <div className="scoreboard-tile"><span>Best</span><strong>{analytics.bestScore}%</strong></div>
                    <div className="scoreboard-tile"><span>Completion</span><strong>{analytics.completionRate}%</strong></div>
                    <div className="scoreboard-tile"><span>Total sessions</span><strong>{analytics.latestSessions.length}</strong></div>
                  </div>
                </article>
              </section>

              <section className="analytics-grid analytics-grid--bottom">
                <article className="analytics-card analytics-card--chart">
                  <div className="analytics-card-head"><div><p className="analytics-card-label">Performance Curve</p><h3>Recent score trend</h3></div></div>
                  {analytics.chartSessions.length > 0 ? (
                    <div className="score-chart">
                      <svg viewBox="0 0 520 220" className="score-chart-svg" aria-label="Recent score trend">
                        <defs>
                          <linearGradient id="score-line" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#13b2cf" />
                            <stop offset="100%" stopColor="#ff8c42" />
                          </linearGradient>
                        </defs>
                        {[0, 25, 50, 75, 100].map((tick) => {
                          const y = 180 - (tick / 100) * 180;
                          return <g key={tick}><line x1="0" x2="520" y1={y} y2={y} className="chart-grid-line" /><text x="0" y={y - 6} className="chart-grid-label">{tick}</text></g>;
                        })}
                        <path d={analytics.chartPath} className="chart-line" />
                        {analytics.chartScores.map((score, index) => {
                          const x = analytics.chartScores.length === 1 ? 260 : (index / (analytics.chartScores.length - 1)) * 520;
                          const y = 180 - (score / 100) * 180;
                          return <circle key={`${score}-${index}`} cx={x} cy={y} r="5.5" className="chart-point" />;
                        })}
                      </svg>
                      <div className="chart-label-row">{analytics.chartSessions.map((session) => <span key={session.id}>{formatShortDate(session.completed_at)}</span>)}</div>
                    </div>
                  ) : <p className="analytics-empty">Complete a few sessions and the score curve will render here.</p>}
                </article>

                <article className="analytics-card analytics-card--timeline">
                  <div className="analytics-card-head"><div><p className="analytics-card-label">Database Timeline</p><h3>Latest sessions from SQLite</h3></div></div>
                  {decayLoading && analytics.latestSessions.length === 0 && !decay ? (
                    <p className="analytics-empty">Loading session history...</p>
                  ) : decayFetchFailed && !decay && !decayLoading ? (
                    <p className="analytics-empty analytics-empty--error">Could not load analytics. Check that the API is running at <code>localhost:8000</code>.</p>
                  ) : analytics.latestSessions.length > 0 ? (
                    <ul className="session-timeline" aria-label="Past sessions from database">
                      {analytics.latestSessions.map((session, index) => (
                        <li key={session.id} className="timeline-item">
                          <div className="timeline-rail"><span className="timeline-dot" />{index < analytics.latestSessions.length - 1 && <span className="timeline-line" />}</div>
                          <div className="timeline-card">
                            <div className="timeline-card-main">
                              <div><strong>{formatRetentionDate(session.completed_at)}</strong><p>{formatProcedureLabel(session.procedure_id)} · {session.difficulty}</p></div>
                              <div className="timeline-score">{Math.round(session.final_score * 100)}%</div>
                            </div>
                            <div className="timeline-meta"><span>{session.passed === false ? "Needs review" : "Passed"}</span><span>{session.attempt_count} attempts</span><span>{formatSessionDuration(session.duration_ms)}</span></div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="analytics-empty">Enter your name and complete a procedure once. Your full retention history will appear here.</p>}
                </article>
              </section>
            </>
          ) : (
            <article className="analytics-card analytics-card--empty"><p className="analytics-empty">Confirm a learner name first. Analytics will light up as soon as the first session is saved.</p></article>
          )}
        </section>
      )}

      {activeTab === "procedures" && (
        <section className="procedures-shell">
          <article className="analytics-card analytics-card--empty"><p className="analytics-empty">Procedures is ready for future multi-skill expansion. The current live workflow stays focused on surgical knot tying.</p></article>
        </section>
      )}
    </main>
  );
}

