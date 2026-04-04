export type FeedbackItem = {
  code: string;
  message: string;
  severity: string;
};

export type StepInfo = {
  id: string;
  dwell_time_ms: number;
};

export type FatigueInfo = {
  fatigue_level: "fresh" | "mild" | "moderate" | "high" | "critical";
  fatigue_score: number;
  recommended_break_seconds: number;
  session_minutes: number;
  warning_message: string | null;
};

export type FrameResponse = {
  step: string;
  valid: boolean;
  score: number;
  feedback: FeedbackItem[];
  landmarks?: number[][];
  joint_confidence?: Record<string, number>;
  landmarks_estimated?: boolean;
  angles?: Record<string, number>;
  distances?: Record<string, number>;
  procedure_steps?: StepInfo[];
  reset?: boolean;
  difficulty?: string;
  fatigue?: FatigueInfo;
  avg_joint_confidence?: number;
  capture_state?: "searching" | "low_confidence" | "tracked";
};
