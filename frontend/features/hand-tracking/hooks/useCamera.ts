"use client";

import { useEffect, useRef, useState } from "react";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function getCameraStreamWithRetry(
  preferredFacingMode: "user" | "environment",
  maxAttempts = 4,
): Promise<MediaStream> {
  let lastError: unknown;
  const mobile = isMobileDevice();
  const preferredConstraints: Array<MediaTrackConstraints | boolean> = mobile
    ? [
        {
          facingMode: { exact: preferredFacingMode },
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 30, max: 30 },
        },
        {
          facingMode: { ideal: preferredFacingMode },
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 30, max: 30 },
        },
        {
          facingMode: { exact: preferredFacingMode === "user" ? "environment" : "user" },
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 30, max: 30 },
        },
        {
          facingMode: { ideal: preferredFacingMode === "user" ? "environment" : "user" },
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 30, max: 30 },
        },
        {
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 24, max: 30 },
        },
      ]
    : [
        {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        true,
      ];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      for (const video of preferredConstraints) {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video,
            audio: false,
          });
        } catch (error) {
          lastError = error;
        }
      }
      if (mobile) {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      throw lastError instanceof Error ? lastError : new Error("Camera unavailable");
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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [preferredFacingMode, setPreferredFacingMode] = useState<"user" | "environment">("user");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: number | null = null;
    let visibilityHandler: (() => void) | null = null;
    let stopped = false;
    let attachFrameId: number | null = null;
    let detectorClose: (() => void) | null = null;

    const startLandmarkLoop = async (videoEl: HTMLVideoElement) => {
      try {
        const mobile = isMobileDevice();
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
          minHandDetectionConfidence: mobile ? 0.22 : 0.3,
          minHandPresenceConfidence: mobile ? 0.22 : 0.3,
          minTrackingConfidence: mobile ? 0.22 : 0.3,
        });
        if (stopped) {
          detector.close();
          return;
        }

        let targetIntervalMs = mobile ? 40 : 33;
        let missCount = 0;
        let stableHitCount = 0;
        const warmupUntil = performance.now() + 1800;

        const tick = () => {
          if (stopped) {
            detector.close();
            return;
          }

          if (videoEl.readyState >= 2) {
            const startedAt = performance.now();
            const result = detector.detectForVideo(videoEl, performance.now());
            const landmarks =
              result.landmarks?.[0]?.map((point) => [point.x, point.y, point.z]) ?? [];
            const detectTimeMs = performance.now() - startedAt;

            if (mobile) {
              const previousIntervalMs = targetIntervalMs;
              const hasHand = landmarks.length > 0;

              if (hasHand) {
                missCount = 0;
                stableHitCount += 1;
              } else {
                missCount += 1;
                stableHitCount = 0;
              }

              if (performance.now() < warmupUntil) {
                targetIntervalMs = 33;
              } else if (!hasHand || missCount >= 3) {
                targetIntervalMs = 33;
              } else if (detectTimeMs > 52) {
                targetIntervalMs = 83;
              } else if (detectTimeMs > 36) {
                targetIntervalMs = 66;
              } else if (stableHitCount >= 10) {
                targetIntervalMs = 50;
              } else {
                targetIntervalMs = 40;
              }

              if (intervalId !== null && previousIntervalMs !== targetIntervalMs) {
                window.clearInterval(intervalId);
                intervalId = window.setInterval(tick, targetIntervalMs);
              }
            }

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
        intervalId = window.setInterval(tick, targetIntervalMs);

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
        if (!window.isSecureContext) {
          setCameraError(
            "Camera needs HTTPS on phone. Open this app through an https tunnel like ngrok or cloudflared.",
          );
          setStreamReady(false);
          return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError("This browser does not expose camera access.");
          setStreamReady(false);
          return;
        }

        setStreamReady(false);
        window.dispatchEvent(
          new CustomEvent("skillsync:landmarks", {
            detail: { landmarks: [] },
          }),
        );
        stream = await getCameraStreamWithRetry(preferredFacingMode);
        setCameraError(null);

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
        if (error instanceof DOMException) {
          if (error.name === "NotAllowedError") {
            setCameraError("Camera permission was denied. Allow camera access in Chrome site settings.");
            return;
          }
          if (error.name === "NotFoundError") {
            setCameraError("No camera was found on this device.");
            return;
          }
          if (error.name === "NotReadableError") {
            setCameraError("The camera is busy in another app. Close it and retry.");
            return;
          }
          setCameraError(`${error.name}: ${error.message || "Camera access failed."}`);
          return;
        }
        setCameraError("Camera access failed. Use HTTPS and allow camera permission.");
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
  }, [preferredFacingMode]);

  const switchCamera = () => {
    setPreferredFacingMode((current) =>
      current === "user" ? "environment" : "user",
    );
  };

  return {
    videoRef,
    streamReady,
    cameraError,
    preferredFacingMode,
    switchCamera,
  };
}
