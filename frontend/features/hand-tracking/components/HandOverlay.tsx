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
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  if (landmarks.length < 21) {
    return;
  }

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
    ctx.moveTo(start[0] * width, start[1] * height);
    ctx.lineTo(end[0] * width, end[1] * height);
    ctx.stroke();
  });

  landmarks.forEach((point, index) => {
    const x = point[0] * width;
    const y = point[1] * height;
    ctx.beginPath();
    ctx.fillStyle = index === 0 ? palette.wrist : palette.point;
    ctx.arc(x, y, index === 0 ? 5 : 3.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

type LandmarksDetail = {
  landmarks?: number[][];
};

export default function HandOverlay({ landmarks, variant = "warn" }: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const variantRef = useRef<"good" | "warn" | "bad">("warn");

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

    // If landmarks are provided via props, draw from props (controlled mode).
    if (Array.isArray(landmarks)) {
      drawHand(ctx, canvas, landmarks, variantRef.current);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Otherwise, subscribe directly to the camera landmark events.
    // This avoids re-rendering the whole page at camera FPS and keeps overlay smooth.
    const handleLandmarks = (event: Event) => {
      const customEvent = event as CustomEvent<LandmarksDetail>;
      const points = customEvent.detail?.landmarks;
      if (Array.isArray(points)) {
        drawHand(ctx, canvas, points, variantRef.current);
      }
    };

    window.addEventListener("skillsync:landmarks", handleLandmarks);
    return () => {
      window.removeEventListener("skillsync:landmarks", handleLandmarks);
    };
  }, [landmarks]);

  return (
    <canvas ref={canvasRef} width={1000} height={620} className="stage-canvas" />
  );
}
