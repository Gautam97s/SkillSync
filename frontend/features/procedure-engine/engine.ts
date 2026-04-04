import type { FatigueInfo, FeedbackItem, FrameResponse, StepInfo } from "../../shared/lib/types";

type AngleConstraint = { min: number; max: number };
type DistanceConstraint = { min?: number; max?: number };
type ScalarConstraint = { min?: number; max?: number };

type StepConstraints = {
  angles: Record<string, AngleConstraint>;
  distances: Record<string, DistanceConstraint>;
  scalars: Record<string, ScalarConstraint>;
};

type StepSchema = {
  id: string;
  name?: string;
  description?: string;
  constraints: StepConstraints;
  dwell_time_ms: number;
  next_step: string;
};

type ProcedureSchema = {
  procedure_id: string;
  steps: StepSchema[];
};

type ValidationViolation = {
  constraint_key: string;
  expected: Record<string, number>;
  actual: number;
  deviation_amount: number;
};

type ValidationResult = {
  valid: boolean;
  violations: ValidationViolation[];
};

type StepUpdate = {
  step_started: string;
  step_now: string;
  advanced: boolean;
  step_valid_since_ms: number | null;
  dwell_remaining_ms: number;
  completed: boolean;
  reset: boolean;
};

type SessionState = {
  current_step_id: string;
  step_valid_since_ms: number | null;
  step_invalid_since_ms: number | null;
  mcp_out_of_range_since_ms: number | null;
  completed: boolean;
};

type OcclusionEstimate = {
  landmarks: number[][];
  jointConfidence: Record<string, number>;
  estimated: boolean;
  expired: boolean;
};

type RuntimeProfile = "desktop" | "mobile";

type FrameStats = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  span: number;
};

const LANDMARK_NAMES = [
  "wrist",
  "thumb_cmc",
  "thumb_mcp",
  "thumb_ip",
  "thumb_tip",
  "index_mcp",
  "index_pip",
  "index_dip",
  "index_tip",
  "middle_mcp",
  "middle_pip",
  "middle_dip",
  "middle_tip",
  "ring_mcp",
  "ring_pip",
  "ring_dip",
  "ring_tip",
  "pinky_mcp",
  "pinky_pip",
  "pinky_dip",
  "pinky_tip",
] as const;

const JOINT_BASE_CONFIDENCE = [
  1.0, 0.96, 0.95, 0.9, 0.82, 0.96, 0.92, 0.88, 0.8, 0.96, 0.92, 0.88, 0.8,
  0.96, 0.92, 0.88, 0.8, 0.96, 0.92, 0.88, 0.8,
];

const PROCEDURES: Record<string, ProcedureSchema> = {
  surgical_knot_tying: {
    procedure_id: "surgical_knot_tying",
    steps: [
      {
        id: "thumb_index_precision_grip",
        name: "Thumb-Index Precision Grip",
        description: "Keep your thumb and index finger close together.",
        constraints: {
          angles: {},
          distances: { thumb_index_over_palm: { min: 0, max: 0.35 } },
          scalars: {},
        },
        dwell_time_ms: 2000,
        next_step: "middle_finger_support",
      },
      {
        id: "middle_finger_support",
        name: "Middle Finger Support",
        description: "Use your middle finger to support the grip.",
        constraints: {
          angles: { index_middle_alignment: { min: 0, max: 75 } },
          distances: { index_middle_over_palm: { max: 0.6 } },
          scalars: { middle_below_index: { min: 0, max: 5 } },
        },
        dwell_time_ms: 2000,
        next_step: "initial_incision_position",
      },
      {
        id: "initial_incision_position",
        name: "Initial Incision Position",
        description: "Start with the tool mostly upright.",
        constraints: {
          angles: { wrist_index_angle: { min: 70, max: 110 } },
          distances: {},
          scalars: {},
        },
        dwell_time_ms: 2000,
        next_step: "cutting_angle_control",
      },
      {
        id: "cutting_angle_control",
        name: "Cutting Angle Control",
        description: "Lower the tool to a comfortable cutting angle.",
        constraints: {
          angles: { wrist_index_angle: { min: 30, max: 45 } },
          distances: {},
          scalars: {},
        },
        dwell_time_ms: 2000,
        next_step: "grip_stability",
      },
      {
        id: "grip_stability",
        name: "Grip Stability",
        description: "Hold the same clean grip without shaking.",
        constraints: {
          angles: { wrist_index_angle: { min: 30, max: 45 } },
          distances: {
            thumb_index_over_palm: { min: 0, max: 0.35 },
            index_middle_over_palm: { max: 0.6 },
          },
          scalars: { middle_below_index: { min: 0, max: 5 } },
        },
        dwell_time_ms: 2000,
        next_step: "completed",
      },
      {
        id: "completed",
        name: "Completed",
        description: "Procedure completed successfully.",
        constraints: { angles: {}, distances: {}, scalars: {} },
        dwell_time_ms: 0,
        next_step: "completed",
      },
    ],
  },
};

const DIFFICULTY_OVERRIDES = {
  beginner: {
    initial_incision_position: { angles: { wrist_index_angle: { min: 60, max: 120 } } },
    cutting_angle_control: { angles: { wrist_index_angle: { min: 30, max: 60 } } },
    grip_stability: { angles: { wrist_index_angle: { min: 30, max: 60 } } },
  },
} as const;

const PLAIN_FEEDBACK_BY_CONSTRAINT: Record<string, string> = {
  thumb_index_over_palm: "Bring your thumb and index finger a little closer.",
  index_middle_over_palm: "Move your middle finger closer to your index finger.",
  index_middle_alignment: "Keep your index and middle finger aligned.",
  middle_below_index: "Place your middle finger slightly below your index finger for support.",
  wrist_index_angle: "Adjust your wrist angle and hold it steady.",
};

const ZERO_ANGLES: Record<string, number> = {
  thumb_index_angle: 0,
  wrist_finger_angle: 0,
  mcp_joint: 0,
  pip_joint: 0,
  wrist_index_angle: 0,
  index_middle_alignment: 0,
};

const ZERO_DISTANCES: Record<string, number> = {
  thumb_index_distance: 0,
  index_middle_distance: 0,
  palm_width: 0,
  thumb_index_over_palm: 0,
  index_middle_over_palm: 0,
  middle_below_index: 0,
};

function neutralFatigue(): FatigueInfo {
  return {
    fatigue_level: "fresh",
    fatigue_score: 0,
    recommended_break_seconds: 0,
    session_minutes: 0,
    warning_message: null,
  };
}

function cloneProcedure(schema: ProcedureSchema): ProcedureSchema {
  return JSON.parse(JSON.stringify(schema)) as ProcedureSchema;
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function euclidean3d(a: number[], b: number[]) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
      (a[1] - b[1]) ** 2 +
      (a[2] - b[2]) ** 2,
  );
}

function calculateAngle3d(p1: number[], p2: number[], p3: number[]) {
  const v1 = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const v2 = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
  const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
  if (mag1 * mag2 === 0) {
    return 0;
  }
  const cosine = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populationStd(values: number[]) {
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function loadProcedureSchema(procedureId: string, difficulty: string) {
  const raw = PROCEDURES[procedureId];
  if (!raw) {
    throw new Error(`Unknown procedure_id=${procedureId}`);
  }

  const schema = cloneProcedure(raw);
  const overrides = DIFFICULTY_OVERRIDES[difficulty as keyof typeof DIFFICULTY_OVERRIDES];
  if (!overrides) {
    return schema;
  }

  for (const step of schema.steps) {
    const stepOverrides =
      overrides[step.id as keyof typeof overrides] as
        | Partial<Record<keyof StepConstraints, Record<string, Record<string, number>>>>
        | undefined;
    if (!stepOverrides) {
      continue;
    }
    for (const category of ["angles", "distances", "scalars"] as const) {
      const entries = stepOverrides[category];
      if (!entries) {
        continue;
      }
      for (const [key, value] of Object.entries(entries)) {
        const current = step.constraints[category][key] ?? {};
        step.constraints[category][key] = { ...current, ...value };
      }
    }
  }

  return schema;
}

function applyRuntimeProfile(schema: ProcedureSchema, profile: RuntimeProfile) {
  if (profile !== "mobile") {
    return schema;
  }

  const mobileSchema = cloneProcedure(schema);
  for (const step of mobileSchema.steps) {
    for (const constraint of Object.values(step.constraints.angles)) {
      const center = (constraint.min + constraint.max) / 2;
      const halfRange = (constraint.max - constraint.min) / 2;
      const expandedHalfRange = halfRange * 1.18 + 4;
      constraint.min = Math.max(0, center - expandedHalfRange);
      constraint.max = Math.min(180, center + expandedHalfRange);
    }

    for (const constraint of Object.values(step.constraints.distances)) {
      if (constraint.min !== undefined) {
        constraint.min = Math.max(0, constraint.min * 0.88);
      }
      if (constraint.max !== undefined) {
        constraint.max = constraint.max * 1.18 + 0.02;
      }
    }

    for (const constraint of Object.values(step.constraints.scalars)) {
      if (constraint.min !== undefined) {
        constraint.min = Math.max(0, constraint.min - 0.5);
      }
      if (constraint.max !== undefined) {
        constraint.max = constraint.max + 0.75;
      }
    }
  }

  return mobileSchema;
}

function normalizeLandmarks(landmarks: number[][]) {
  if (!landmarks.length) {
    return [];
  }
  const [baseX, baseY, baseZ] = landmarks[0];
  return landmarks.map(([x, y, z]) => [x - baseX, y - baseY, z - baseZ]);
}

function computeAngles(landmarks: number[][]): Record<string, number> {
  if (landmarks.length < 21) {
    return { ...ZERO_ANGLES };
  }
  return {
    thumb_index_angle: calculateAngle3d(landmarks[4], landmarks[0], landmarks[8]),
    wrist_finger_angle: calculateAngle3d(landmarks[0], landmarks[9], landmarks[12]),
    mcp_joint: calculateAngle3d(landmarks[4], landmarks[5], landmarks[6]),
    pip_joint: calculateAngle3d(landmarks[5], landmarks[6], landmarks[7]),
    wrist_index_angle: calculateAngle3d(landmarks[0], landmarks[5], landmarks[8]),
    index_middle_alignment: calculateAngle3d(landmarks[5], landmarks[8], landmarks[12]),
  };
}

function computeDistances(landmarks: number[][]): Record<string, number> {
  if (landmarks.length < 21) {
    return { ...ZERO_DISTANCES };
  }
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const thumbIndexDistance = euclidean3d(thumbTip, indexTip);
  const indexMiddleDistance = euclidean3d(indexTip, middleTip);
  const palmWidth = euclidean3d(landmarks[5], landmarks[17]);
  const thumbIndexOverPalm = palmWidth <= 1e-6 ? 0 : thumbIndexDistance / palmWidth;
  const indexMiddleOverPalm = palmWidth <= 1e-6 ? 0 : indexMiddleDistance / palmWidth;

  return {
    thumb_index_distance: thumbIndexDistance,
    index_middle_distance: indexMiddleDistance,
    palm_width: palmWidth,
    thumb_index_over_palm: thumbIndexOverPalm,
    index_middle_over_palm: indexMiddleOverPalm,
    middle_below_index: middleTip[1] > indexTip[1] ? 1 : 0,
  };
}

function smoothMetricMap({
  previous,
  next,
  alpha = 0.3,
}: {
  previous: Record<string, number> | null;
  next: Record<string, number>;
  alpha?: number;
}) {
  if (!previous || Object.keys(previous).length !== Object.keys(next).length) {
    return { ...next };
  }
  const beta = 1 - alpha;
  return Object.fromEntries(
    Object.entries(next).map(([key, value]) => [
      key,
      alpha * Number(value) + beta * Number(previous[key] ?? value),
    ]),
  );
}

function computeScore(valid: boolean, stability: number) {
  const bounded = Math.max(0, Math.min(1, stability));
  return valid ? bounded : 0.25 * bounded;
}

function averageJointConfidence(jointConfidence: Record<string, number>) {
  const values = Object.values(jointConfidence);
  if (!values.length) {
    return 0;
  }
  return mean(values);
}

function computeFrameStats(landmarks: number[][]): FrameStats | null {
  if (!landmarks.length) {
    return null;
  }

  const xs = landmarks.map((point) => point[0]);
  const ys = landmarks.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    span: Math.max(maxX - minX, maxY - minY),
  };
}

function captureGuidance({
  frameStats,
  runtimeProfile,
}: {
  frameStats: FrameStats | null;
  runtimeProfile: RuntimeProfile;
}): string {
  if (!frameStats) {
    return "Place your full hand in the center of the camera view.";
  }

  if (frameStats.centerX < 0.38) {
    return "Move your hand slightly to the right in the camera view.";
  }
  if (frameStats.centerX > 0.62) {
    return "Move your hand slightly to the left in the camera view.";
  }
  if (frameStats.centerY < 0.34) {
    return "Move your hand a little lower in the camera view.";
  }
  if (frameStats.centerY > 0.7) {
    return "Move your hand a little higher in the camera view.";
  }
  if (frameStats.span < (runtimeProfile === "mobile" ? 0.34 : 0.28)) {
    return "Bring the phone a bit closer or move your hand closer so the full hand fills more of the frame.";
  }
  if (frameStats.span > 0.82) {
    return "Move the phone slightly back so the full hand stays visible.";
  }
  return "Hold still for a moment so tracking can lock the full hand cleanly.";
}

function violationDirectionalFeedback(violation: ValidationViolation): string {
  const amount = Math.abs(violation.deviation_amount);
  switch (violation.constraint_key) {
    case "thumb_index_over_palm":
      return `Tighten the pinch. Move your thumb and index finger closer together by about ${(amount * 100).toFixed(0)}% of your palm width.`;
    case "index_middle_over_palm":
      return `Bring the middle finger inward toward the index finger by about ${(amount * 100).toFixed(0)}% of your palm width.`;
    case "index_middle_alignment":
      return `Straighten the index-middle line. Rotate the middle finger toward the index finger by about ${Math.max(3, Math.round(amount))} degrees.`;
    case "middle_below_index":
      return "Lower the middle finger slightly under the index finger for support.";
    case "wrist_index_angle": {
      const min = violation.expected.min ?? 0;
      const max = violation.expected.max ?? 180;
      if (violation.actual < min) {
        return `Raise the index side of your hand and open the wrist angle by about ${Math.max(4, Math.round(amount))} degrees.`;
      }
      if (violation.actual > max) {
        return `Lower the index side and close the wrist angle by about ${Math.max(4, Math.round(amount))} degrees.`;
      }
      return "Adjust your wrist angle and hold it steady.";
    }
    default:
      return "Adjust your hand position slightly and try again.";
  }
}

class LandmarkSmoother {
  private previous: number[][] | null = null;

  update(landmarks: number[][], alpha = 0.35) {
    if (!landmarks.length) {
      return [];
    }
    if (!this.previous || this.previous.length !== landmarks.length) {
      this.previous = landmarks.map((point) => [...point]);
      return this.previous;
    }

    const beta = 1 - alpha;
    this.previous = landmarks.map((point, index) => {
      const prev = this.previous?.[index] ?? point;
      return [
        alpha * point[0] + beta * prev[0],
        alpha * point[1] + beta * prev[1],
        alpha * point[2] + beta * prev[2],
      ];
    });
    return this.previous;
  }

  reset() {
    this.previous = null;
  }
}

class JointOcclusionEstimator {
  private lastObserved: number[][] | null = null;
  private lastVelocity: number[][] | null = null;
  private lastSeenMs: number | null = null;

  reset() {
    this.lastObserved = null;
    this.lastVelocity = null;
    this.lastSeenMs = null;
  }

  observe(landmarks: number[][], timestampMs: number): OcclusionEstimate {
    const copied = landmarks.map(([x, y, z]) => [x, y, z]);
    if (copied.length !== LANDMARK_NAMES.length) {
      return this.predict(timestampMs);
    }

    if (this.lastObserved && this.lastSeenMs !== null) {
      const dtMs = Math.max(1, timestampMs - this.lastSeenMs);
      const dtSeconds = dtMs / 1000;
      const velocities = copied.map((point, index) => {
        const prev = this.lastObserved?.[index] ?? point;
        return [
          (point[0] - prev[0]) / dtSeconds,
          (point[1] - prev[1]) / dtSeconds,
          (point[2] - prev[2]) / dtSeconds,
        ];
      });
      this.lastVelocity = !this.lastVelocity
        ? velocities
        : velocities.map((velocity, index) => {
            const prev = this.lastVelocity?.[index] ?? velocity;
            const blend = 0.55;
            return [
              blend * velocity[0] + (1 - blend) * prev[0],
              blend * velocity[1] + (1 - blend) * prev[1],
              blend * velocity[2] + (1 - blend) * prev[2],
            ];
          });
    } else {
      this.lastVelocity = copied.map(() => [0, 0, 0]);
    }

    this.lastObserved = copied;
    this.lastSeenMs = timestampMs;

    return {
      landmarks: copied,
      jointConfidence: Object.fromEntries(LANDMARK_NAMES.map((name) => [name, 1])),
      estimated: false,
      expired: false,
    };
  }

  predict(timestampMs: number): OcclusionEstimate {
    if (!this.lastObserved || this.lastSeenMs === null) {
      return {
        landmarks: [],
        jointConfidence: Object.fromEntries(LANDMARK_NAMES.map((name) => [name, 0])),
        estimated: true,
        expired: false,
      };
    }

    const elapsedMs = Math.max(0, timestampMs - this.lastSeenMs);
    if (elapsedMs >= 2500) {
      this.reset();
      return {
        landmarks: [],
        jointConfidence: Object.fromEntries(LANDMARK_NAMES.map((name) => [name, 0])),
        estimated: true,
        expired: true,
      };
    }

    const elapsedSeconds = elapsedMs / 1000;
    const decay = Math.exp(-elapsedSeconds * 0.12);
    const horizon = Math.max(0, 1 - elapsedMs / 2500);
    const palmWidth = euclidean3d(this.lastObserved[5], this.lastObserved[17]);
    const allowedShift = clamp(palmWidth * 0.65, 0.03, 0.22) * Math.max(0.35, horizon);
    const globalConfidence = Math.max(0.08, horizon * decay);

    const predicted = this.lastObserved.map((point, index) => {
      const velocity = this.lastVelocity?.[index] ?? [0, 0, 0];
      let dx = velocity[0] * elapsedSeconds * decay;
      let dy = velocity[1] * elapsedSeconds * decay;
      let dz = velocity[2] * elapsedSeconds * decay;
      const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (displacement > allowedShift && displacement > 1e-9) {
        const scale = allowedShift / displacement;
        dx *= scale;
        dy *= scale;
        dz *= scale;
      }
      return [
        clamp(point[0] + dx, 0, 1),
        clamp(point[1] + dy, 0, 1),
        clamp(point[2] + dz, -0.6, 0.6),
      ];
    });

    return {
      landmarks: predicted,
      jointConfidence: Object.fromEntries(
        LANDMARK_NAMES.map((name, index) => [
          name,
          Number(Math.max(0, Math.min(1, globalConfidence * JOINT_BASE_CONFIDENCE[index])).toFixed(4)),
        ]),
      ),
      estimated: true,
      expired: false,
    };
  }
}

class StabilityScorer {
  private featureOrder: string[] | null = null;
  private history: Array<{ timestampMs: number; values: number[] }> = [];

  reset() {
    this.featureOrder = null;
    this.history = [];
  }

  update({
    angles,
    distances,
    timestampMs,
  }: {
    angles: Record<string, number>;
    distances: Record<string, number>;
    timestampMs: number;
  }) {
    const last = this.history[this.history.length - 1];
    if (last && (timestampMs < last.timestampMs || timestampMs - last.timestampMs > 5000)) {
      this.reset();
    }

    if (!this.featureOrder) {
      this.featureOrder = [...Object.keys(angles).sort(), ...Object.keys(distances).sort()];
    }

    const values = this.featureOrder.map((key) =>
      key in angles ? Number(angles[key]) : Number(distances[key] ?? 0),
    );
    this.history.push({ timestampMs, values });
    if (this.history.length > 20) {
      this.history.shift();
    }
    if (this.history.length < 6) {
      return 1;
    }

    const byDimension = this.featureOrder.map((_, index) =>
      this.history.map((snapshot) => snapshot.values[index] ?? 0),
    );
    const cvs = byDimension.map((series) => {
      const avg = mean(series);
      const sigma = populationStd(series);
      return sigma / (Math.abs(avg) + 1e-6);
    });
    const jitter = mean(cvs);
    return clamp(1 / (1 + jitter / 0.15), 0, 1);
  }
}

class FatigueDetector {
  private sessionStartMs: number | null = null;
  private lastBreakMs: number | null = null;
  private stabilityHistory: Array<{ timestampMs: number; stability: number }> = [];
  private errorHistory: Array<{ timestampMs: number; hadError: boolean }> = [];
  private baselineScores: number[] = [];
  private baselineMean: number | null = null;
  private currentScore = 0;

  reset() {
    this.sessionStartMs = null;
    this.lastBreakMs = null;
    this.stabilityHistory = [];
    this.errorHistory = [];
    this.baselineScores = [];
    this.baselineMean = null;
    this.currentScore = 0;
  }

  update({
    stabilityScore,
    hadError,
    timestampMs,
  }: {
    stabilityScore: number;
    hadError: boolean;
    timestampMs: number;
  }): FatigueInfo {
    if (this.sessionStartMs === null) {
      this.sessionStartMs = timestampMs;
      this.lastBreakMs = timestampMs;
    }

    this.stabilityHistory.push({ timestampMs, stability: stabilityScore });
    this.errorHistory.push({ timestampMs, hadError });
    if (this.stabilityHistory.length > 120) {
      this.stabilityHistory.shift();
    }
    if (this.errorHistory.length > 120) {
      this.errorHistory.shift();
    }

    if (this.baselineScores.length < 20) {
      this.baselineScores.push(stabilityScore);
      if (this.baselineScores.length === 20) {
        this.baselineMean = mean(this.baselineScores);
      }
    }

    const sessionMinutes = (timestampMs - this.sessionStartMs) / 60000;
    if (timestampMs - this.sessionStartMs < 30000) {
      return {
        fatigue_level: "fresh",
        fatigue_score: 0,
        recommended_break_seconds: 0,
        session_minutes: Number(sessionMinutes.toFixed(1)),
        warning_message: null,
      };
    }

    const timeFatigue =
      sessionMinutes <= 30
        ? 0
        : sessionMinutes <= 45
          ? 0.3 * ((sessionMinutes - 30) / 15)
          : sessionMinutes <= 60
            ? 0.3 + 0.3 * ((sessionMinutes - 45) / 15)
            : sessionMinutes <= 90
              ? 0.6 + 0.4 * ((sessionMinutes - 60) / 30)
              : 1;
    const stabilityFatigue = clamp(1 - mean(this.stabilityHistory.map((item) => item.stability)), 0, 1);
    const errorRate =
      this.errorHistory.filter((item) => item.hadError).length / Math.max(1, this.errorHistory.length);
    const recentAvg = mean(this.stabilityHistory.slice(-20).map((item) => item.stability));
    const degradation =
      this.baselineMean && this.baselineMean > 0
        ? clamp(((this.baselineMean - recentAvg) / this.baselineMean) * 100, 0, 100)
        : 0;

    const fatigueScore =
      0.4 * timeFatigue + 0.25 * stabilityFatigue + 0.15 * errorRate + 0.2 * (degradation / 100);
    this.currentScore = clamp(0.3 * fatigueScore + 0.7 * this.currentScore, 0, 1);

    const fatigueLevel: FatigueInfo["fatigue_level"] =
      this.currentScore < 0.15
        ? "fresh"
        : this.currentScore < 0.35
          ? "mild"
          : this.currentScore < 0.55
            ? "moderate"
            : this.currentScore < 0.75
              ? "high"
              : "critical";

    return {
      fatigue_level: fatigueLevel,
      fatigue_score: Number(this.currentScore.toFixed(3)),
      recommended_break_seconds:
        fatigueLevel === "fresh"
          ? 0
          : fatigueLevel === "mild"
            ? 30
            : fatigueLevel === "moderate"
              ? 60
              : fatigueLevel === "high"
                ? 120
                : 300,
      session_minutes: Number(sessionMinutes.toFixed(1)),
      warning_message:
        fatigueLevel === "fresh"
          ? null
          : `Session running for ${sessionMinutes.toFixed(0)} minutes. Consider a break to maintain accuracy.`,
    };
  }
}

function validateStep({
  step,
  angles,
  distances,
  scalars,
}: {
  step: StepSchema;
  angles: Record<string, number>;
  distances: Record<string, number>;
  scalars: Record<string, number>;
}): ValidationResult {
  const violations: ValidationViolation[] = [];

  for (const [key, constraint] of Object.entries(step.constraints.angles)) {
    const actual = Number(angles[key] ?? 0);
    if (actual < constraint.min) {
      violations.push({
        constraint_key: key,
        expected: { min: constraint.min, max: constraint.max },
        actual,
        deviation_amount: constraint.min - actual,
      });
    } else if (actual > constraint.max) {
      violations.push({
        constraint_key: key,
        expected: { min: constraint.min, max: constraint.max },
        actual,
        deviation_amount: actual - constraint.max,
      });
    }
  }

  for (const [key, constraint] of Object.entries(step.constraints.distances)) {
    const actual = Number(distances[key] ?? 0);
    if (constraint.min !== undefined && actual < constraint.min) {
      violations.push({
        constraint_key: key,
        expected: {
          ...(constraint.min !== undefined ? { min: constraint.min } : {}),
          ...(constraint.max !== undefined ? { max: constraint.max } : {}),
        },
        actual,
        deviation_amount: constraint.min - actual,
      });
    } else if (constraint.max !== undefined && actual > constraint.max) {
      violations.push({
        constraint_key: key,
        expected: {
          ...(constraint.min !== undefined ? { min: constraint.min } : {}),
          ...(constraint.max !== undefined ? { max: constraint.max } : {}),
        },
        actual,
        deviation_amount: actual - constraint.max,
      });
    }
  }

  for (const [key, constraint] of Object.entries(step.constraints.scalars)) {
    const actual = Number(scalars[key] ?? 0);
    if (constraint.min !== undefined && actual < constraint.min) {
      violations.push({
        constraint_key: key,
        expected: {
          ...(constraint.min !== undefined ? { min: constraint.min } : {}),
          ...(constraint.max !== undefined ? { max: constraint.max } : {}),
        },
        actual,
        deviation_amount: constraint.min - actual,
      });
    } else if (constraint.max !== undefined && actual > constraint.max) {
      violations.push({
        constraint_key: key,
        expected: {
          ...(constraint.min !== undefined ? { min: constraint.min } : {}),
          ...(constraint.max !== undefined ? { max: constraint.max } : {}),
        },
        actual,
        deviation_amount: actual - constraint.max,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

function generateFeedback(validation: ValidationResult, stepUpdate: StepUpdate): FeedbackItem[] {
  if (!validation.valid) {
    const key = String(validation.violations[0]?.constraint_key ?? "constraint");
    const directionalMessage = validation.violations[0]
      ? violationDirectionalFeedback(validation.violations[0])
      : "Adjust your hand position slightly and try again.";
    return [
      {
        code: `${key.toUpperCase()}_VIOLATION`,
        message: directionalMessage,
        severity: "warning",
      },
      {
        code: `${key.toUpperCase()}_TIP`,
        message:
          PLAIN_FEEDBACK_BY_CONSTRAINT[key] ??
          "Adjust your grip and try to match the target position.",
        severity: "info",
      },
    ];
  }

  if (stepUpdate.dwell_remaining_ms > 0) {
    return [
      {
        code: "DWELL_REMAINING",
        message: `Nice. Keep holding for about ${Math.max(1, Math.ceil(stepUpdate.dwell_remaining_ms / 1000))} more second(s).`,
        severity: "info",
      },
    ];
  }

  if (stepUpdate.advanced && stepUpdate.step_now !== stepUpdate.step_started) {
    return [
      {
        code: "STEP_COMPLETE",
        message: "Great job. Step complete, moving to the next one.",
        severity: "info",
      },
    ];
  }

  return [{ code: "OK", message: "Good form. Keep it steady.", severity: "info" }];
}

class ProcedureStateMachine {
  private procedureId: string;
  private state: SessionState | null = null;

  constructor(procedureId: string) {
    this.procedureId = procedureId;
  }

  reset() {
    const schema = loadProcedureSchema(this.procedureId, "beginner");
    this.state = {
      current_step_id: schema.steps[0].id,
      step_valid_since_ms: null,
      step_invalid_since_ms: null,
      mcp_out_of_range_since_ms: null,
      completed: false,
    };
  }

  getCurrentStepId() {
    if (!this.state) {
      this.reset();
    }
    return this.state?.current_step_id ?? "thumb_index_precision_grip";
  }

  update(validConstraints: boolean, mcpInRange: boolean | null, timestampMs: number): StepUpdate {
    if (!this.state) {
      this.reset();
    }
    const schema = loadProcedureSchema(this.procedureId, "beginner");
    const stepsById = Object.fromEntries(schema.steps.map((step) => [step.id, step]));
    const state = this.state as SessionState;
    const stepStarted = state.current_step_id;
    const stepSchema = stepsById[stepStarted];

    if (mcpInRange === false) {
      if (state.mcp_out_of_range_since_ms === null) {
        state.mcp_out_of_range_since_ms = timestampMs;
      }
      if (timestampMs - state.mcp_out_of_range_since_ms >= 3000) {
        this.reset();
        return {
          step_started: stepStarted,
          step_now: this.getCurrentStepId(),
          advanced: false,
          step_valid_since_ms: null,
          dwell_remaining_ms: 0,
          completed: false,
          reset: true,
        };
      }
    } else if (mcpInRange === true) {
      state.mcp_out_of_range_since_ms = null;
    }

    if (!validConstraints) {
      state.step_valid_since_ms = null;
      state.step_invalid_since_ms = null;
      state.completed = state.current_step_id === "completed";
      return {
        step_started: stepStarted,
        step_now: state.current_step_id,
        advanced: false,
        step_valid_since_ms: state.step_valid_since_ms,
        dwell_remaining_ms: 0,
        completed: state.completed,
        reset: false,
      };
    }

    if (state.step_valid_since_ms === null) {
      state.step_valid_since_ms = timestampMs;
    }
    state.step_invalid_since_ms = null;

    const dwellMs = stepSchema.dwell_time_ms;
    if (dwellMs <= 0) {
      state.current_step_id = stepSchema.next_step;
      state.step_valid_since_ms = null;
      state.step_invalid_since_ms = null;
      state.completed = state.current_step_id === "completed";
      return {
        step_started: stepStarted,
        step_now: state.current_step_id,
        advanced: state.current_step_id !== stepStarted,
        step_valid_since_ms: null,
        dwell_remaining_ms: 0,
        completed: state.completed,
        reset: false,
      };
    }

    const remainingMs = dwellMs - (timestampMs - state.step_valid_since_ms);
    if (remainingMs > 0) {
      state.completed = state.current_step_id === "completed";
      return {
        step_started: stepStarted,
        step_now: state.current_step_id,
        advanced: false,
        step_valid_since_ms: state.step_valid_since_ms,
        dwell_remaining_ms: remainingMs,
        completed: state.completed,
        reset: false,
      };
    }

    state.current_step_id = stepSchema.next_step;
    state.step_valid_since_ms = null;
    state.step_invalid_since_ms = null;
    state.completed = state.current_step_id === "completed";
    return {
      step_started: stepStarted,
      step_now: state.current_step_id,
      advanced: state.current_step_id !== stepStarted,
      step_valid_since_ms: null,
      dwell_remaining_ms: 0,
      completed: state.completed,
      reset: false,
    };
  }
}

export class SkillSyncProcedureEngine {
  private procedureId: string;
  private difficulty: string;
  private runtimeProfile: RuntimeProfile;
  private smoother = new LandmarkSmoother();
  private estimator = new JointOcclusionEstimator();
  private stability = new StabilityScorer();
  private fatigue = new FatigueDetector();
  private previousAngles: Record<string, number> | null = null;
  private previousDistances: Record<string, number> | null = null;
  private stateMachine: ProcedureStateMachine;

  constructor({
    procedureId = "surgical_knot_tying",
    difficulty = "beginner",
    runtimeProfile = "desktop",
  }: {
    procedureId?: string;
    difficulty?: string;
    runtimeProfile?: RuntimeProfile;
  } = {}) {
    this.procedureId = procedureId;
    this.difficulty = difficulty;
    this.runtimeProfile = runtimeProfile;
    this.stateMachine = new ProcedureStateMachine(procedureId);
  }

  setDifficulty(difficulty: string) {
    if (this.difficulty === difficulty) {
      return;
    }
    this.difficulty = difficulty;
    this.reset();
  }

  setRuntimeProfile(runtimeProfile: RuntimeProfile) {
    if (this.runtimeProfile === runtimeProfile) {
      return;
    }
    this.runtimeProfile = runtimeProfile;
    this.reset();
  }

  reset() {
    this.smoother.reset();
    this.estimator.reset();
    this.stability.reset();
    this.fatigue.reset();
    this.previousAngles = null;
    this.previousDistances = null;
    this.stateMachine = new ProcedureStateMachine(this.procedureId);
  }

  processFrame({
    landmarks,
    timestampMs,
  }: {
    landmarks: number[][];
    timestampMs: number;
  }): FrameResponse {
    const schema = applyRuntimeProfile(
      loadProcedureSchema(this.procedureId, this.difficulty),
      this.runtimeProfile,
    );
    const procedureSteps: StepInfo[] = schema.steps.map((step) => ({
      id: step.id,
      dwell_time_ms: step.dwell_time_ms,
    }));
    const estimate = landmarks.length
      ? this.estimator.observe(landmarks, timestampMs)
      : this.estimator.predict(timestampMs);

    if (!estimate.landmarks.length) {
      this.stateMachine.reset();
      this.smoother.reset();
      this.stability.reset();
      this.previousAngles = null;
      this.previousDistances = null;
      return {
        step: schema.steps[0].id,
        valid: false,
        score: 0,
        feedback: [
          {
            code: "HAND_NOT_VISIBLE",
            message: "Place your full hand in the center of the camera view.",
            severity: "info",
          },
        ],
        landmarks: [],
        joint_confidence: estimate.jointConfidence,
        landmarks_estimated: estimate.estimated,
        angles: { ...ZERO_ANGLES },
        distances: { ...ZERO_DISTANCES },
        procedure_steps: procedureSteps,
        reset: estimate.expired,
        difficulty: this.difficulty,
        fatigue: neutralFatigue(),
        avg_joint_confidence: 0,
        capture_state: "searching",
      };
    }

    const normalized = normalizeLandmarks(estimate.landmarks);
    const frameStats = computeFrameStats(estimate.landmarks);
    const smoothedLandmarks = this.smoother.update(
      normalized,
      this.runtimeProfile === "mobile" ? 0.28 : 0.35,
    );
    const angles = smoothMetricMap({
      previous: this.previousAngles,
      next: computeAngles(smoothedLandmarks),
    });
    const distances = smoothMetricMap({
      previous: this.previousDistances,
      next: computeDistances(smoothedLandmarks),
    });
    this.previousAngles = angles;
    this.previousDistances = distances;

    const stepsById = Object.fromEntries(schema.steps.map((step) => [step.id, step]));
    const currentStepId = this.stateMachine.getCurrentStepId();
    const stepSchema = stepsById[currentStepId];
    const validation = validateStep({
      step: stepSchema,
      angles,
      distances,
      scalars: distances,
    });

    const holdSteady = stepsById.hold_steady;
    const mcpConstraint =
      holdSteady?.constraints.angles.mcp_joint ?? stepSchema.constraints.angles.mcp_joint;
    const mcpInRange =
      mcpConstraint === undefined
        ? null
        : angles.mcp_joint >= mcpConstraint.min && angles.mcp_joint <= mcpConstraint.max;

    const stepUpdate = this.stateMachine.update(validation.valid, mcpInRange, timestampMs);
    const validationNow = validateStep({
      step: stepsById[stepUpdate.step_now],
      angles,
      distances,
      scalars: distances,
    });
    const stability = this.stability.update({ angles, distances, timestampMs });
    const fatigue = this.fatigue.update({
      stabilityScore: stability,
      hadError: !validationNow.valid,
      timestampMs,
    });
    const avgJointConfidence = averageJointConfidence(estimate.jointConfidence);
    const lowConfidenceThreshold = this.runtimeProfile === "mobile" ? 0.62 : 0.5;
    const captureState =
      estimate.estimated || avgJointConfidence < lowConfidenceThreshold
        ? "low_confidence"
        : "tracked";
    const baseScore = computeScore(validationNow.valid, stability);
    const finalScore =
      captureState === "low_confidence"
        ? Math.min(baseScore, this.runtimeProfile === "mobile" ? 0.58 : 0.7)
        : baseScore;
    const feedback =
      captureState === "low_confidence"
        ? [
            {
              code: "CAPTURE_QUALITY",
              message: captureGuidance({
                frameStats,
                runtimeProfile: this.runtimeProfile,
              }),
              severity: "info",
            },
            {
              code: "CAPTURE_HINT",
              message:
                this.runtimeProfile === "mobile"
                  ? "For phone tracking, keep the full hand visible, avoid backlight, and pause briefly after moving."
                  : "Keep the full hand visible and hold still for cleaner tracking.",
              severity: "info",
            },
          ]
        : generateFeedback(validation, stepUpdate);

    return {
      step: stepUpdate.step_now,
      valid: validationNow.valid,
      score: finalScore,
      feedback,
      landmarks: estimate.landmarks,
      joint_confidence: estimate.jointConfidence,
      landmarks_estimated: estimate.estimated,
      angles,
      distances,
      procedure_steps: procedureSteps,
      reset: stepUpdate.reset,
      difficulty: this.difficulty,
      fatigue,
      avg_joint_confidence: Number(avgJointConfidence.toFixed(3)),
      capture_state: captureState,
    };
  }
}
