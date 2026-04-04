export type FeedbackItem = {
  code: string;
  message: string;
  severity: string;
};

export type StepInfo = {
  id: string;
  dwell_time_ms: number;
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

/** Row from GET /api/students/{id}/sessions (SQLite `passed` as bool in JSON). */
export type SessionRecord = {
  id: number;
  procedure_id: string;
  difficulty: string;
  completed_at: string | null;
  final_score: number;
  duration_ms: number;
  attempt_count: number;
  avg_hesitation_ms: number;
  tremor_score: number;
  passed: boolean;
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
  session_saved?: boolean;
  fatigue?: {
    fatigue_level: string;
    fatigue_score: number;
    recommended_break_seconds: number;
    session_minutes: number;
    warning_message?: string | null;
  };
  skill_decay?: DecayPrediction;
    performance_degradation_pct?: number;
    time_since_last_break_minutes?: number;
};
