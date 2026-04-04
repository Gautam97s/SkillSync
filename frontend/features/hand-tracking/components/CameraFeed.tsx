"use client";

import { useCamera } from "../hooks/useCamera";

type CameraFeedProps = {
  compact?: boolean;
};

export default function CameraFeed({ compact = false }: CameraFeedProps) {
  const {
    videoRef,
    streamReady,
    cameraError,
    preferredFacingMode,
    switchCamera,
  } = useCamera();

  if (compact) {
    return (
      <div className="camera-stage-layer">
        <video ref={videoRef} autoPlay playsInline muted className="stage-video" />
        <button
          type="button"
          className="camera-switch-btn"
          onClick={switchCamera}
          aria-label={`Switch to ${preferredFacingMode === "user" ? "rear" : "front"} camera`}
        >
          {preferredFacingMode === "user" ? "Rear Camera" : "Front Camera"}
        </button>
        {!streamReady && (
          <div className="stage-empty">
            {cameraError ?? "Allow camera access to start live tracking."}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Camera Feed</h2>
      <video ref={videoRef} autoPlay playsInline muted className="video" />
      <p>{streamReady ? "Camera connected" : cameraError ?? "Waiting for camera permissions..."}</p>
    </div>
  );
}
