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
  joint_confidence?: Record<string, number>;
  landmarks_estimated?: boolean;
  angles?: Record<string, number>;
  distances?: Record<string, number>;
  procedure_steps?: StepInfo[];
  reset?: boolean;
};
