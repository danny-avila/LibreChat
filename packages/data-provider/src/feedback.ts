import { z } from 'zod';

export type TFeedbackRating = 'thumbsUp' | 'thumbsDown';
export const FEEDBACK_RATINGS = ['thumbsUp', 'thumbsDown'] as const;

export const FEEDBACK_REASON_KEYS = [
  // Down
  'slow_response',
  'missing_outdated_information',
  'dont_trust_advice',
  'not_suitable_for_region',
  'doesnt_match_season',
  'not_satisfied',
  'will_not_recommend',
  'inappropriate_response',
  'other',

  // Up
  'useful_crop_recommendations',
  'helpful_information',
  'trust_advice',
  'matches_area',
  'matches_current_season',
  'correctly_identified_crop_problem',
  'very_satisfied',
  'recommend_to_others',
  'user_friendly_language',
] as const;

export type TFeedbackTagKey = (typeof FEEDBACK_REASON_KEYS)[number];

export interface TFeedbackTag {
  key: TFeedbackTagKey;
  label: string;
  direction: TFeedbackRating;
  icon: string;
}

// --- Tag Registry ---
export const FEEDBACK_TAGS: TFeedbackTag[] = [
  // Thumbs Down
  {
    key: 'slow_response',
    label: 'com_ui_feedback_tag_slow_response',
    direction: 'thumbsDown',
    icon: 'Clock',
  },
  {
    key: 'missing_outdated_information',
    label: 'com_ui_feedback_tag_missing_outdated_information',
    direction: 'thumbsDown',
    icon: 'AlertCircle',
  },
  {
    key: 'dont_trust_advice',
    label: 'com_ui_feedback_tag_dont_trust_advice',
    direction: 'thumbsDown',
    icon: 'ShieldAlert',
  },
  {
    key: 'not_suitable_for_region',
    label: 'com_ui_feedback_tag_not_suitable_for_region',
    direction: 'thumbsDown',
    icon: 'MapPinOff',
  },
  {
    key: 'doesnt_match_season',
    label: 'com_ui_feedback_tag_doesnt_match_season',
    direction: 'thumbsDown',
    icon: 'CalendarX',
  },
  {
    key: 'not_satisfied',
    label: 'com_ui_feedback_tag_not_satisfied',
    direction: 'thumbsDown',
    icon: 'Frown',
  },
  {
    key: 'will_not_recommend',
    label: 'com_ui_feedback_tag_will_not_recommend',
    direction: 'thumbsDown',
    icon: 'ThumbsDown',
  },
  {
    key: 'inappropriate_response',
    label: 'com_ui_feedback_tag_inappropriate_response',
    direction: 'thumbsDown',
    icon: 'Ban',
  },
  {
    key: 'other',
    label: 'com_ui_feedback_tag_other',
    direction: 'thumbsDown',
    icon: 'HelpCircle',
  },

  // Thumbs Up
  {
    key: 'useful_crop_recommendations',
    label: 'com_ui_feedback_tag_useful_crop_recommendations',
    direction: 'thumbsUp',
    icon: 'Sprout',
  },
  {
    key: 'helpful_information',
    label: 'com_ui_feedback_tag_helpful_information',
    direction: 'thumbsUp',
    icon: 'Info',
  },
  {
    key: 'trust_advice',
    label: 'com_ui_feedback_tag_trust_advice',
    direction: 'thumbsUp',
    icon: 'ShieldCheck',
  },
  {
    key: 'matches_area',
    label: 'com_ui_feedback_tag_matches_area',
    direction: 'thumbsUp',
    icon: 'MapPin',
  },
  {
    key: 'matches_current_season',
    label: 'com_ui_feedback_tag_matches_current_season',
    direction: 'thumbsUp',
    icon: 'CalendarCheck',
  },
  {
    key: 'correctly_identified_crop_problem',
    label: 'com_ui_feedback_tag_correctly_identified_crop_problem',
    direction: 'thumbsUp',
    icon: 'ScanSearch',
  },
  {
    key: 'very_satisfied',
    label: 'com_ui_feedback_tag_very_satisfied',
    direction: 'thumbsUp',
    icon: 'Smile',
  },
  {
    key: 'recommend_to_others',
    label: 'com_ui_feedback_tag_recommend_to_others',
    direction: 'thumbsUp',
    icon: 'Users',
  },
  {
    key: 'user_friendly_language',
    label: 'com_ui_feedback_tag_user_friendly_language',
    direction: 'thumbsUp',
    icon: 'MessageCircle',
  },
];

export function getTagsForRating(rating: TFeedbackRating): TFeedbackTag[] {
  return FEEDBACK_TAGS.filter((tag) => tag.direction === rating);
}

export const feedbackTagKeySchema = z.enum(FEEDBACK_REASON_KEYS);
export const feedbackRatingSchema = z.enum(FEEDBACK_RATINGS);

export const feedbackSchema = z.object({
  rating: feedbackRatingSchema,
  tag: feedbackTagKeySchema,
  text: z.string().max(1024).optional(),
});

export type TMinimalFeedback = z.infer<typeof feedbackSchema>;

export type TFeedback = {
  rating: TFeedbackRating;
  tag: TFeedbackTag | undefined;
  text?: string;
};

export function toMinimalFeedback(feedback: TFeedback | undefined): TMinimalFeedback | undefined {
  if (!feedback?.rating || !feedback?.tag || !feedback.tag.key) {
    return undefined;
  }

  return {
    rating: feedback.rating,
    tag: feedback.tag.key,
    text: feedback.text,
  };
}

export function getTagByKey(key: TFeedbackTagKey | undefined): TFeedbackTag | undefined {
  if (!key) {
    return undefined;
  }
  return FEEDBACK_TAGS.find((tag) => tag.key === key);
}
