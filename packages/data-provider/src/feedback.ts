export type TFeedbackRating = 'thumbsUp' | 'thumbsDown' | null;

export interface TFeedbackContent {
  tags: string[];
  text?: string | null;
}

export const feedbackTags = {
  thumbsDown: [
    'com_ui_feedback_tag_memory',
    'com_ui_feedback_tag_style',
    'com_ui_feedback_tag_incorrect',
    'com_ui_feedback_tag_instructions',
    'com_ui_feedback_tag_refused',
    'com_ui_feedback_tag_lazy',
    'com_ui_feedback_tag_unsafe',
    'com_ui_feedback_tag_biased',
    'com_ui_feedback_tag_other',
  ],
  // In the future, you could add positive feedback tags here
  thumbsUp: [],
} as const;

export type TFeedbackTag =
  | (typeof feedbackTags.thumbsDown)[number]
  | (typeof feedbackTags.thumbsUp)[number];
