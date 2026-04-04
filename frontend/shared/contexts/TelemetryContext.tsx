"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SkillSyncProcedureEngine } from "../../features/procedure-engine/engine";
import type { FrameResponse } from "../lib/types";

type LandmarksDetail = {
  landmarks?: number[][];
};

interface TelemetryContextValue {
  connected: boolean;
  latest: FrameResponse | null;
  setDifficulty: (difficulty: string) => void;
  resetSession: () => void;
}

function detectRuntimeProfile() {
  if (typeof navigator === "undefined") {
    return "desktop" as const;
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    ? "mobile"
    : "desktop";
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef(new SkillSyncProcedureEngine());
  const lastFrameAtRef = useRef(0);
  const lastPublishAtRef = useRef(0);
  const latestFrameRef = useRef<FrameResponse | null>(null);
  const [connected, setConnected] = useState(false);
  const [latest, setLatest] = useState<FrameResponse | null>(null);

  useEffect(() => {
    engineRef.current.setRuntimeProfile(detectRuntimeProfile());

    const handleLandmarks = (event: Event) => {
      const customEvent = event as CustomEvent<LandmarksDetail>;
      const points = Array.isArray(customEvent.detail?.landmarks)
        ? customEvent.detail.landmarks
        : [];
      const now = Date.now();
      lastFrameAtRef.current = now;
      setConnected(true);
      const previousFrame = latestFrameRef.current;
      const nextFrame = engineRef.current.processFrame({
        landmarks: points,
        timestampMs: now,
      });
      latestFrameRef.current = nextFrame;

      const lastPublished = lastPublishAtRef.current;
      const shouldPublish =
        (now - lastPublished) >= 80 ||
        nextFrame.reset ||
        nextFrame.step !== previousFrame?.step ||
        nextFrame.capture_state !== previousFrame?.capture_state;

      if (shouldPublish) {
        lastPublishAtRef.current = now;
        setLatest(nextFrame);
      }
    };

    const heartbeat = window.setInterval(() => {
      if (Date.now() - lastFrameAtRef.current > 1500) {
        setConnected(false);
      }
    }, 500);

    window.addEventListener("skillsync:landmarks", handleLandmarks);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("skillsync:landmarks", handleLandmarks);
    };
  }, []);

  const setDifficulty = useCallback((difficulty: string) => {
    engineRef.current.setDifficulty(difficulty);
    latestFrameRef.current = null;
    lastPublishAtRef.current = 0;
    setLatest(null);
  }, []);

  const resetSession = useCallback(() => {
    engineRef.current.reset();
    latestFrameRef.current = null;
    lastPublishAtRef.current = 0;
    setLatest(null);
  }, []);

  return (
    <TelemetryContext.Provider value={{ connected, latest, setDifficulty, resetSession }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error("useTelemetry must be used within a TelemetryProvider");
  }
  return ctx;
}
