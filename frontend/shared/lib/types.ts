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
  // ✅ keep strict enum (better than string)
  fatigue_level: "fresh" | "mild" | "moderate" | "high" | "critical";
  fatigue_score: number;
  recommended_break_seconds: number;
  session_minutes: number;

  // ✅ keep optional (safer for backend variability)
  warning_message?: string | null;
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

  // ✅ keep both
  session_saved?: boolean;
  fatigue?: FatigueInfo;

  // ✅ keep telemetry fields
  avg_joint_confidence?: number;
  capture_state?: "searching" | "low_confidence" | "tracked";
};

export type DecayPrediction = {
  student_id: string;
  total_sessions: number;
  last_session_date: string | null;
  last_score: number;
  decay_rate: number;
  current_competency: number;
  projected_decay_date: string | null;
  days_until_decay: number | null;
  refresher_date: string | null;
  refresher_needed: boolean;
};