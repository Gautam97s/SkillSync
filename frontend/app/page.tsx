"use client";

import { useEffect, useRef, useState } from "react";
import CameraFeed from "../features/hand-tracking/components/CameraFeed";
import HandOverlay from "../features/hand-tracking/components/HandOverlay";
// import ProtractorGuidance from "../features/hand-tracking/components/ProtractorGuidance";
import { useTelemetry } from "../shared/contexts/TelemetryContext";

type LandmarksDetail = {
  landmarks?: number[][];
};

export default function HomePage() {
  const { connected, latest, send } = useTelemetry();
  const frameCounter = useRef(0);
  const landmarksRef = useRef<number[][]>([]);

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
    if (!connected) {
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
  }, [connected, send]);

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
    if (latest?.score !== undefined) {
      const s = latest.score;
      scoreEmaRef.current =
        scoreEmaRef.current * 0.97 + Math.max(0, Math.min(1, s)) * 0.03;
    }
  }, [latest?.score]);

  useEffect(() => {
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

  const mcp = latest?.angles?.mcp_joint;
  const MCP_MIN = 20;
  const MCP_MAX = 45;
  const overlayVariant: "good" | "warn" | "bad" =
    typeof mcp !== "number"
      ? "warn"
      : mcp >= MCP_MIN && mcp <= MCP_MAX
        ? "good"
        : mcp > MCP_MAX && mcp <= 60
          ? "warn"
          : "bad";

  const stepDescriptions: Record<string, string> = {
    grip_init: "Establish initial grip with proper finger positioning.",
    hold_steady: "Maintain the grip between 30 and 45 degrees for 3 seconds.",
    completed: "Procedure completed successfully.",
  };

  const procedureSteps = latest?.procedure_steps || [
    { id: "grip_init", dwell_time_ms: 700 },
    { id: "hold_steady", dwell_time_ms: 3000 },
    { id: "completed", dwell_time_ms: 0 },
  ];
  const effectiveStepId = latest?.reset ? procedureSteps[0]?.id : latest?.step;
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
          </div>

          <div className="hand-stage" aria-label="Live hand stage">
            <div className="stage-glow" />
            <CameraFeed compact />
            <HandOverlay variant={overlayVariant} />
            {/* <ProtractorGuidance targetAngleDeg={90} toleranceDeg={12} softBandDeg={20} /> */}
            {!connected && <div className="stage-empty">Waiting for backend websocket...</div>}

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

            <button className="primary-cta">Continue Procedure</button>
            <button className="text-cta">Save and Exit Session</button>
          </article>
        </aside>
      </section>
    </main>
  );
}
