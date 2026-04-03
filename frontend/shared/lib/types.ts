export type FeedbackItem = {
  code: string;
  message: string;
  severity: string;
};

export type StepInfo = {
  id: string;
  dwell_time_ms: number;
};

export type FrameResponse = {
  step: string;
  valid: boolean;
  score: number;
  feedback: FeedbackItem[];
  landmarks?: number[][];
  angles?: Record<string, number>;
  distances?: Record<string, number>;
  procedure_steps?: StepInfo[];
  reset?: boolean;
  difficulty?: string;
  session_saved?: boolean;
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
