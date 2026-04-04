"use client";

import { useEffect, useRef, useState } from "react";
import CameraFeed from "./CameraFeed";
import HandOverlay from "./HandOverlay";

type OverlayVariant = "good" | "warn" | "bad";

type LiveStageProps = {
  connected: boolean;
  overlayVariant: OverlayVariant;
};

export default function LiveStage({
  connected,
  overlayVariant,
}: LiveStageProps) {
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsStageFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleStageFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await stage.requestFullscreen();
  };

  return (
    <div ref={stageRef} className="hand-stage" aria-label="Live hand stage">
      <div className="stage-glow" />
      <button
        type="button"
        className="stage-fullscreen-btn"
        onClick={() => {
          void toggleStageFullscreen();
        }}
        aria-label={isStageFullscreen ? "Exit fullscreen camera view" : "Enter fullscreen camera view"}
      >
        {isStageFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
      <CameraFeed compact />
      <HandOverlay variant={overlayVariant} />
      {!connected && <div className="stage-empty">Waiting for live camera frames...</div>}
    </div>
  );
}
