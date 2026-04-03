"use client";

import { useEffect, useRef } from "react";

type LandmarksDetail = {
  landmarks?: number[][];
};

/** 0° = right, 90° = up, 180° = left (screen coords, y increases downward). */
function wristToMiddleMcpAngleDeg(landmarks: number[][]) {
  const w = landmarks[0];
  const m = landmarks[9];
  if (!w || !m) {
    return null;
  }
  const dx = m[0] - w[0];
  const dy = m[1] - w[1];
  return (Math.atan2(-dy, dx) * 180) / Math.PI;
}

/** Canvas radians: 0 = east, -π/2 = north (screen up). Matches angleDeg above. */
function angleDegToCanvasRad(angleDeg: number) {
  return (-angleDeg * Math.PI) / 180;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

type ProtractorGuidanceProps = {
  /** Ideal “up” pose in the same angle space as wrist→middle MCP (degrees). */
  targetAngleDeg?: number;
  /** Degrees within target = “hold”. */
  toleranceDeg?: number;
  /** Degrees outside tolerance but still “yellow” band before red. */
  softBandDeg?: number;
};

export default function ProtractorGuidance({
  targetAngleDeg = 90,
  toleranceDeg = 12,
  softBandDeg = 22,
}: ProtractorGuidanceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      return;
    }

    const draw = (landmarks: number[][]) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      if (landmarks.length < 21) {
        return;
      }

      const angleDeg = wristToMiddleMcpAngleDeg(landmarks);
      if (angleDeg === null) {
        return;
      }

      const err = angleDeg - targetAngleDeg;
      const absErr = Math.abs(err);
      let status: "good" | "warn" | "bad" = "bad";
      if (absErr <= toleranceDeg) {
        status = "good";
      } else if (absErr <= toleranceDeg + softBandDeg) {
        status = "warn";
      }

      const palette =
        status === "good"
          ? { arc: "rgba(34, 197, 94, 0.55)", needle: "#22c55e", glow: "rgba(16, 185, 129, 0.35)", panel: "rgba(4, 24, 33, 0.72)" }
          : status === "warn"
            ? { arc: "rgba(234, 179, 8, 0.55)", needle: "#eab308", glow: "rgba(250, 204, 21, 0.35)", panel: "rgba(45, 35, 8, 0.72)" }
            : { arc: "rgba(239, 68, 68, 0.55)", needle: "#ef4444", glow: "rgba(248, 113, 113, 0.35)", panel: "rgba(40, 12, 12, 0.72)" };

      // Top-right HUD: frosted card — left: words, right: 3D-style protractor + pen
      const panelW = Math.min(width, height) * 0.44;
      const panelH = height * 0.24;
      const panelX = width - panelW - width * 0.02;
      const panelY = height * 0.03;

      const cx = panelX + panelW * 0.78;
      const cy = panelY + panelH * 0.52;
      const r = Math.min(width, height) * 0.078;

      // Plain-English direction (computed before panel text layout)
      const steer = clamp(err, -40, 40);
      let mainHint = "Hold steady";
      let subHint = "On target";
      if (steer > toleranceDeg) {
        // Video is mirrored; flip left/right guidance to match what user sees.
        mainHint = "Move right";
        subHint = "Aim the pen toward the right side of the screen.";
      } else if (steer < -toleranceDeg) {
        mainHint = "Move left";
        subHint = "Aim the pen toward the left side of the screen.";
      }

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      roundRectPath(ctx, panelX, panelY, panelW, panelH, 14);
      ctx.fillStyle = palette.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "rgba(195, 231, 239, 0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = "700 13px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle = "rgba(230, 248, 252, 0.98)";
      ctx.textAlign = "left";
      ctx.fillText("Direction", panelX + 14, panelY + 24);
      ctx.font = "500 10px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle = "rgba(186, 220, 228, 0.88)";
      ctx.fillText("Align the colored pen with the faint target line.", panelX + 14, panelY + 40);

      ctx.font = "700 15px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle =
        status === "good" ? "rgba(187, 247, 208, 0.98)" : status === "warn" ? "rgba(254, 240, 138, 0.98)" : "rgba(254, 202, 202, 0.98)";
      ctx.fillText(mainHint, panelX + 14, panelY + 64);

      ctx.font = "500 10px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle = "rgba(200, 230, 236, 0.9)";
      const subLines = subHint.length > 42 ? [subHint.slice(0, 42), subHint.slice(42)] : [subHint];
      ctx.fillText(subLines[0], panelX + 14, panelY + 82);
      if (subLines[1]) {
        ctx.fillText(subLines[1], panelX + 14, panelY + 95);
      }

      ctx.font = "500 9px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle = "rgba(160, 200, 210, 0.85)";
      ctx.fillText(`Angle ${Math.round(angleDeg)}° · target ${targetAngleDeg}°`, panelX + 14, panelY + (subLines[1] ? 112 : 98));

      ctx.lineWidth = 3;
      ctx.strokeStyle = palette.arc;
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      // Upper semicircle (through north)
      ctx.arc(cx, cy, r, Math.PI, 0, true);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Ticks every 30° from 0° (right) to 180° (left) along the arc
      for (let a = 0; a <= 180; a += 30) {
        const rad = angleDegToCanvasRad(a);
        const inner = r - 8;
        const outer = r;
        ctx.beginPath();
        ctx.strokeStyle = "rgba(226, 245, 250, 0.55)";
        ctx.lineWidth = 2;
        ctx.moveTo(cx + inner * Math.cos(rad), cy + inner * Math.sin(rad));
        ctx.lineTo(cx + outer * Math.cos(rad), cy + outer * Math.sin(rad));
        ctx.stroke();
      }

      // Target needle (ghost)
      const targetRad = angleDegToCanvasRad(targetAngleDeg);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (r - 4) * Math.cos(targetRad), cy + (r - 4) * Math.sin(targetRad));
      ctx.stroke();

      // Current “pen” needle (thick, slight taper via shadow)
      const curRad = angleDegToCanvasRad(angleDeg);
      const nx = cx + (r - 6) * Math.cos(curRad);
      const ny = cy + (r - 6) * Math.sin(curRad);

      ctx.strokeStyle = palette.needle;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Pen tip (small ellipse at end)
      ctx.fillStyle = palette.needle;
      ctx.beginPath();
      ctx.ellipse(nx, ny, 4, 6, curRad + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();

      // Pivot cap (3D-ish highlight)
      const capGrad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 10);
      capGrad.addColorStop(0, "rgba(255,255,255,0.95)");
      capGrad.addColorStop(1, "rgba(180, 210, 220, 0.5)");
      ctx.fillStyle = capGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();

      // L / R / Up markers on arc (screen compass)
      ctx.font = "600 9px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle = "rgba(200, 230, 236, 0.75)";
      ctx.textAlign = "center";
      const lr = r + 12;
      ctx.fillText("R", cx + lr * Math.cos(angleDegToCanvasRad(0)), cy + lr * Math.sin(angleDegToCanvasRad(0)) + 3);
      ctx.fillText("L", cx + lr * Math.cos(angleDegToCanvasRad(180)), cy + lr * Math.sin(angleDegToCanvasRad(180)) + 3);
      ctx.fillText("Up", cx + lr * Math.cos(angleDegToCanvasRad(90)), cy + lr * Math.sin(angleDegToCanvasRad(90)) + 3);

      ctx.restore();
    };

    const onLandmarks = (event: Event) => {
      const customEvent = event as CustomEvent<LandmarksDetail>;
      const points = customEvent.detail?.landmarks;
      if (Array.isArray(points)) {
        draw(points);
      }
    };

    window.addEventListener("skillsync:landmarks", onLandmarks);
    return () => {
      window.removeEventListener("skillsync:landmarks", onLandmarks);
    };
  }, [targetAngleDeg, toleranceDeg, softBandDeg]);

  return (
    <div
      className="guidance-protractor-3d"
      role="img"
      aria-label="Direction guide in the top-right corner: colored pen shows your aim; align it with the faint target line."
    >
      <canvas ref={canvasRef} width={1000} height={620} className="stage-protractor-canvas" />
    </div>
  );
}
