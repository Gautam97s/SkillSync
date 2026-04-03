export type FeedbackItem = {
  code: string;
  message: string;
  severity: string;
};

export type FrameResponse = {
  step: string;
  valid: boolean;
  score: number;
  feedback: FeedbackItem[];
};
