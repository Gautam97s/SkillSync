"use client";

import { useEffect, useRef } from "react";
import CameraFeed from "../features/hand-tracking/components/CameraFeed";
import HandOverlay from "../features/hand-tracking/components/HandOverlay";
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

  const scorePercent = Math.max(0, Math.min(100, Math.round((latest?.score ?? 0.942) * 100)));
  const primaryFeedback = latest?.feedback?.[0]?.message ?? "Hold position for 3 seconds to confirm joint stability.";

  const stepDescriptions: Record<string, string> = {
    grip_init: "Establish initial grip with proper finger positioning.",
    hold_steady: "Maintain the grip between 30 and 45 degrees for 3 seconds.",
    completed: "Procedure completed successfully.",
  };

  const procedureSteps = latest?.procedure_steps || [];
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
            <HandOverlay />
            {!connected && <div className="stage-empty">Waiting for backend websocket...</div>}
          </div>

          <div className="status-card">
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
            <p className="metric-label">Stability Confidence Score</p>
            <div className="progress-track">
              <span style={{ width: `${scorePercent}%` }} />
            </div>
          </article>

          <article className="angles-card">
            <h2>Joint Angles</h2>
            <div className="angles-grid">
              <div>
                <p>MCP JOINT</p>
                <strong>
                  {latest?.angles?.mcp_joint?.toFixed(1) || "0.0"} deg
                </strong>
              </div>
              <div>
                <p>PIP JOINT</p>
                <strong>
                  {latest?.angles?.pip_joint?.toFixed(1) || "0.0"} deg
                </strong>
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
