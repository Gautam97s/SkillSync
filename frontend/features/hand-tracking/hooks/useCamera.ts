"use client";

import { useEffect, useRef, useState } from "react";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: number | null = null;
    let visibilityHandler: (() => void) | null = null;
    let stopped = false;

    const startLandmarkLoop = async (videoEl: HTMLVideoElement) => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        // Keep this version aligned with the installed npm package to avoid WASM/API mismatches.
        // (Lockfile currently resolves @mediapipe/tasks-vision to 0.10.34.)
        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm",
        );

        const detector = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });

        const tick = () => {
          if (stopped) {
            detector.close();
            return;
          }

          if (videoEl.readyState >= 2) {
            const result = detector.detectForVideo(videoEl, performance.now());
            const landmarks =
              result.landmarks?.[0]?.map((point) => [point.x, point.y, point.z]) ?? [];

            window.dispatchEvent(
              new CustomEvent("skillsync:landmarks", {
                detail: { landmarks },
              }),
            );
          }
        };

        // requestAnimationFrame gets aggressively throttled/paused on background tabs.
        // Use an interval so we recover quickly when the tab becomes visible again.
        tick();
        intervalId = window.setInterval(tick, 33);

        visibilityHandler = () => {
          if (!stopped && document.visibilityState === "visible") {
            tick();
          }
        };
        document.addEventListener("visibilitychange", visibilityHandler);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Hand landmarker init failed:", error);
        window.dispatchEvent(
          new CustomEvent("skillsync:landmarks", {
            detail: { landmarks: [] },
          }),
        );
      }
    };

    const setup = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStreamReady(true);
          startLandmarkLoop(videoRef.current);
        }
      } catch (error) {
        console.error("Camera access failed:", error);
        setStreamReady(false);
      }
    };

    setup();

    return () => {
      stopped = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { videoRef, streamReady };
}
