"use client";

import { useEffect, useRef, useState } from "react";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function getCameraStreamWithRetry(maxAttempts = 4): Promise<MediaStream> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
    } catch (err) {
      lastError = err;
      const name = err instanceof DOMException ? err.name : "";
      // Another tab, React Strict Mode double-mount, or OS still releasing the device.
      if (name === "NotReadableError" || name === "AbortError") {
        await sleep(250 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Camera unavailable");
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: number | null = null;
    let visibilityHandler: (() => void) | null = null;
    let stopped = false;
    let attachFrameId: number | null = null;
    let detectorClose: (() => void) | null = null;

    const startLandmarkLoop = async (videoEl: HTMLVideoElement) => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        if (stopped) {
          return;
        }
        // Keep this version aligned with the installed npm package to avoid WASM/API mismatches.
        // (Lockfile currently resolves @mediapipe/tasks-vision to 0.10.34.)
        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm",
        );
        if (stopped) {
          return;
        }

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
        if (stopped) {
          detector.close();
          return;
        }

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
        detectorClose = () => {
          try {
            detector.close();
          } catch {
            // ignore
          }
        };
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
        stream = await getCameraStreamWithRetry();

        // If React Strict Mode unmounted before getUserMedia resolved, release immediately.
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
          return;
        }

        const attachStream = async () => {
          if (stopped) {
            return;
          }

          const videoEl = videoRef.current;
          if (!videoEl) {
            attachFrameId = window.requestAnimationFrame(() => {
              void attachStream();
            });
            return;
          }

          videoEl.srcObject = null;
          videoEl.srcObject = stream;

          const onLoadedData = () => {
            if (!stopped) {
              setStreamReady(true);
            }
          };

          videoEl.addEventListener("loadeddata", onLoadedData, { once: true });
          try {
            await videoEl.play();
          } catch (playErr) {
            // eslint-disable-next-line no-console
            console.warn("Video play() interrupted or blocked:", playErr);
          }
          if (!stopped) {
            startLandmarkLoop(videoEl);
          }
        };

        await attachStream();
      } catch (error) {
        // eslint-disable-next-line no-console
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
      if (attachFrameId !== null) {
        window.cancelAnimationFrame(attachFrameId);
      }
      detectorClose?.();
      detectorClose = null;
      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };
  }, []);

  return { videoRef, streamReady };
}
