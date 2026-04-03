"use client";

import { useCamera } from "../hooks/useCamera";

export default function CameraFeed() {
  const { videoRef, streamReady } = useCamera();

  return (
    <div className="card">
      <h2>Camera Feed</h2>
      <video ref={videoRef} autoPlay playsInline muted className="video" />
      <p>{streamReady ? "Camera connected" : "Waiting for camera permissions..."}</p>
    </div>
  );
}
