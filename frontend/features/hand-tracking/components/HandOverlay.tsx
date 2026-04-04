"use client";

import { useEffect, useRef } from "react";

type HandOverlayProps = {
  landmarks?: number[][];
  variant?: "good" | "warn" | "bad";
};

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

function getPalette(variant: "good" | "warn" | "bad") {
  if (variant === "good") {
    return {
      stroke: "rgba(34, 197, 94, 0.9)", // green-500
      shadow: "rgba(16, 185, 129, 0.95)",
      wrist: "rgba(220, 252, 231, 0.95)",
      point: "rgba(74, 222, 128, 0.95)",
    };
  }
  if (variant === "warn") {
    return {
      stroke: "rgba(234, 179, 8, 0.9)", // yellow-500
      shadow: "rgba(250, 204, 21, 0.95)",
      wrist: "rgba(254, 249, 195, 0.95)",
      point: "rgba(253, 224, 71, 0.95)",
    };
  }
  return {
    stroke: "rgba(239, 68, 68, 0.92)", // red-500
    shadow: "rgba(248, 113, 113, 0.95)",
    wrist: "rgba(254, 226, 226, 0.95)",
    point: "rgba(252, 165, 165, 0.95)",
  };
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: number[][],
  variant: "good" | "warn" | "bad",
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  if (landmarks.length < 21) {
    return;
  }

  const stage = canvas.parentElement;
  const video = stage?.querySelector<HTMLVideoElement>("video.stage-video");
  const sourceWidth = video?.videoWidth && video.videoWidth > 0 ? video.videoWidth : width;
  const sourceHeight = video?.videoHeight && video.videoHeight > 0 ? video.videoHeight : height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2;

  const toCanvasX = (normalizedX: number) => offsetX + normalizedX * drawnWidth;
  const toCanvasY = (normalizedY: number) => offsetY + normalizedY * drawnHeight;

  const palette = getPalette(variant);
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.stroke;
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 6;

  HAND_CONNECTIONS.forEach(([from, to]) => {
    const start = landmarks[from];
    const end = landmarks[to];
    if (!start || !end) {
      return;
    }

    ctx.beginPath();
    ctx.moveTo(toCanvasX(start[0]), toCanvasY(start[1]));
    ctx.lineTo(toCanvasX(end[0]), toCanvasY(end[1]));
    ctx.stroke();
  });

  landmarks.forEach((point, index) => {
    const x = toCanvasX(point[0]);
    const y = toCanvasY(point[1]);
    ctx.beginPath();
    ctx.fillStyle = index === 0 ? palette.wrist : palette.point;
    ctx.arc(x, y, index === 0 ? 5 : 3.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function syncCanvasSize(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.max(1, Math.round(canvas.clientWidth));
  const displayHeight = Math.max(1, Math.round(canvas.clientHeight));
  const targetWidth = Math.round(displayWidth * dpr);
  const targetHeight = Math.round(displayHeight * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  // Draw in CSS pixel coordinates regardless of DPR.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

type LandmarksDetail = {
  landmarks?: number[][];
};

export default function HandOverlay({ landmarks, variant = "warn" }: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const variantRef = useRef<"good" | "warn" | "bad">("warn");
  const latestPointsRef = useRef<number[][]>([]);

  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      return;
    }

    syncCanvasSize(canvas, ctx);

    const redraw = () => {
      syncCanvasSize(canvas, ctx);
      drawHand(ctx, canvas, latestPointsRef.current, variantRef.current);
    };

    const ro = new ResizeObserver(redraw);
    ro.observe(canvas);
    window.addEventListener("resize", redraw);

    // If landmarks are provided via props, draw from props (controlled mode).
    if (Array.isArray(landmarks)) {
      latestPointsRef.current = landmarks;
      redraw();
      return () => {
        ro.disconnect();
        window.removeEventListener("resize", redraw);
      };
    }

    latestPointsRef.current = [];
    redraw();

    // Otherwise, subscribe directly to the camera landmark events.
    // This avoids re-rendering the whole page at camera FPS and keeps overlay smooth.
    const handleLandmarks = (event: Event) => {
      const customEvent = event as CustomEvent<LandmarksDetail>;
      const points = customEvent.detail?.landmarks;
      if (Array.isArray(points)) {
        latestPointsRef.current = points;
        redraw();
      }
    };

    window.addEventListener("skillsync:landmarks", handleLandmarks);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", redraw);
      window.removeEventListener("skillsync:landmarks", handleLandmarks);
    };
  }, [landmarks]);

  return (
    <canvas ref={canvasRef} width={1000} height={620} className="stage-canvas" />
  );
}
