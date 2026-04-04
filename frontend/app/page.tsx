"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
// import ProtractorGuidance from "../features/hand-tracking/components/ProtractorGuidance";
import { useTelemetry } from "../shared/contexts/TelemetryContext";

const LiveStage = dynamic(
  () => import("../features/hand-tracking/components/LiveStage"),
  {
    ssr: false,
    loading: () => (
      <div className="hand-stage">
        <div className="stage-empty stage-empty--static">Preparing live camera view...</div>
      </div>
    ),
  },
);

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

export default function HomePage() {
  const { connected, latest, setDifficulty: setEngineDifficulty } = useTelemetry();
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setEngineDifficulty(difficulty);
  }, [difficulty, setEngineDifficulty]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

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

  const safeLatest = hasMounted ? latest : null;
  const scorePercent = hasMounted ? displayScorePercent : 94;
  const primaryFeedback =
    safeLatest?.feedback?.[0]?.message ??
    "Hold position for 3 seconds to confirm joint stability.";
  const secondaryFeedback =
    safeLatest?.feedback?.[1]?.message ??
    "Keep the full hand visible and hold still briefly after each adjustment.";
  const captureState = safeLatest?.capture_state ?? "searching";
  const captureChipLabel =
    captureState === "tracked"
      ? "TRACKING"
      : captureState === "low_confidence"
        ? "ADJUST VIEW"
        : "SEARCHING";
  const captureChipClass =
    captureState === "tracked"
      ? "metric-chip"
      : captureState === "low_confidence"
      ? "metric-chip metric-chip--alert"
        : "metric-chip";
  const captureConfidencePercent = Math.round((safeLatest?.avg_joint_confidence ?? 0) * 100);

  const stepDescriptions: Record<string, string> = {
    thumb_index_precision_grip: "Keep thumb and index finger close for precision grip.",
    middle_finger_support: "Use middle finger as supporting finger near index.",
    initial_incision_position: "Start with near-perpendicular tool orientation.",
    cutting_angle_control: "Maintain controlled cutting angle during motion.",
    grip_stability: "Hold the validated grip steadily.",
    completed: "Procedure completed successfully.",
  };

  const procedureSteps = safeLatest?.procedure_steps || [
    { id: "grip_init", dwell_time_ms: 700 },
    { id: "hold_steady", dwell_time_ms: 3000 },
    { id: "completed", dwell_time_ms: 0 },
  ];
  const effectiveStepId = safeLatest?.reset ? procedureSteps[0]?.id : safeLatest?.step;
  const overlayVariant = getStepOverlayVariant(
    effectiveStepId,
    safeLatest?.angles,
    safeLatest?.distances,
    difficulty,
  );
  const currentStepIndex = procedureSteps.findIndex((s) => s.id === effectiveStepId);

  const steps = procedureSteps.map((step, index) => {

    let state: "pending" | "active" | "done" = "pending";
    if (effectiveStepId === step.id) {
      state = "active";
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
          <div className="avatar">GH</div>
        </div>
      </header>

      <section className="content-grid">
        <section className="viewer-panel">
          <div className="viewer-badges">
            <span className="badge badge-live">{connected ? "LIVE TRACKING" : "OFFLINE"}</span>
            <span className="badge badge-stream">FHD STREAM</span>

            <div className="diff-inline" role="radiogroup" aria-label="Difficulty level">
              <button
                id="difficulty-beginner"
                className={`diff-pill ${difficulty === "beginner" ? "diff-pill--active" : ""}`}
                onClick={() => setDifficulty("beginner")}
                aria-pressed={difficulty === "beginner"}
              >
                🟢 Beginner
              </button>
              <button
                id="difficulty-intermediate"
                className={`diff-pill ${difficulty === "intermediate" ? "diff-pill--active" : ""}`}
                onClick={() => setDifficulty("intermediate")}
                aria-pressed={difficulty === "intermediate"}
              >
                🔶 Intermediate
              </button>
            </div>
          </div>

          <div className="stage-shell">
            <LiveStage connected={connected} overlayVariant={overlayVariant} />
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

        <aside className="insights-panel">
          <article className="metric-card">
            <div className="metric-head">
              <span className="metric-icon">B</span>
              <span className={captureChipClass}>{captureChipLabel}</span>
            </div>
            <p className="metric-value">
              {scorePercent}
              <span>%</span>
            </p>
            <p className="metric-label">Grip Stability Confidence Score</p>
            <div className="progress-track">
              <span style={{ width: `${scorePercent}%` }} />
            </div>
            <p className="metric-helper">
              Camera confidence {captureConfidencePercent}% {captureState === "tracked" ? "with full-hand lock." : "needs a cleaner phone view."}
            </p>
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

          <article className="angles-card">
            <h2>Live Direction</h2>
            <div className="guidance-stack">
              <p className="guidance-primary">{primaryFeedback}</p>
              <p className="guidance-secondary">{secondaryFeedback}</p>
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
        </aside>
      </section>
    </main>
  );
}
