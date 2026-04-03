"use client";

import { useCamera } from "../hooks/useCamera";

type CameraFeedProps = {
  compact?: boolean;
};

export default function CameraFeed({ compact = false }: CameraFeedProps) {
  const { videoRef, streamReady } = useCamera();

  if (compact) {
    return (
      <>
        <video ref={videoRef} autoPlay playsInline muted className="stage-video" width="640" height="480" />
        {!streamReady && <div className="stage-empty">Allow camera access to start live tracking.</div>}
      </>
    );
  }

  return (
    <div className="card">
      <h2>Camera Feed</h2>
      <video ref={videoRef} autoPlay playsInline muted className="video" width="640" height="480" />
      <p>{streamReady ? "Camera connected" : "Waiting for camera permissions..."}</p>
    </div>
  );
}
