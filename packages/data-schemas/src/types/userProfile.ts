import type { Types, Document } from 'mongoose';

/**
 * User Profile Schema - Compact storage for user information
 * Uses numeric scales (-1 to 1) for spectrums and short strings for efficiency
 */

// Category interfaces - all fields optional for sparse storage
export interface IdentityProfile {
  age?: number;
  location?: string;
  occupation?: string;
  education?: string;
  family?: string;
  languages?: string[];
  cultural_bg?: string;
}

export interface PersonalityProfile {
  introversion?: number; // -1 (extrovert) to 1 (introvert)
  planning?: number; // -1 (spontaneous) to 1 (planner)
  optimism?: number; // -1 (pessimist) to 1 (optimist)
  risk_tolerance?: number; // -1 (risk-averse) to 1 (risk-taker)
  emotional_logical?: number; // -1 (emotional) to 1 (logical)
  stress_response?: string; // "withdraw" | "seek_support" | "action" | custom
}

export interface ValuesProfile {
  priorities?: string[]; // ["family", "career", "health"]
  principles?: string[]; // ["honesty", "loyalty"]
  success_def?: string;
  non_negotiables?: string[];
  worldview?: string;
  spirituality?: string;
}

export interface GoalsProfile {
  short_term?: string[];
  long_term?: string[];
  dreams?: string[];
  professional?: string[];
  growth_areas?: string[];
}

export interface InterestsProfile {
  hobbies?: string[];
  topics?: string[];
  media?: string[];
  aesthetics?: string[];
  niche?: string[];
}

export interface RelationshipsProfile {
  important_people?: string[]; // ["wife:Sarah", "mentor:John"]
  attachment?: string; // "secure" | "anxious" | "avoidant"
  social_pref?: string; // "small_groups" | "one_on_one" | "large"
  conflict_style?: string; // "avoid" | "confront" | "compromise"
  love_language?: string; // "words" | "acts" | "gifts" | "time" | "touch"
}

export interface EmotionalProfile {
  happy_triggers?: string[];
  frustrations?: string[];
  fears?: string[];
  comfort_sources?: string[];
  pride_points?: string[];
  vulnerabilities?: string[];
}

export interface CommunicationProfile {
  channels?: string[]; // ["text", "call", "in_person"]
  directness?: number; // -1 (indirect) to 1 (direct)
  detail_pref?: string; // "concise" | "detailed"
  tone?: string; // "casual" | "formal" | "warm"
  feedback_style?: string; // "direct" | "sandwich" | "gentle"
  advice_vs_listen?: number; // -1 (listen) to 1 (advice)
}

export interface ThinkingProfile {
  learning_style?: string; // "visual" | "auditory" | "kinesthetic" | "reading"
  decision_making?: string; // "quick" | "deliberate" | "intuitive"
  big_picture_detail?: number; // -1 (detail) to 1 (big picture)
  openness_change?: number; // -1 (resistant) to 1 (open)
  problem_solving?: string; // "analytical" | "creative" | "collaborative"
}

export interface DailyLifeProfile {
  schedule?: string; // "structured" | "flexible" | "chaotic"
  chronotype?: string; // "morning" | "night" | "neither"
  health_habits?: string[];
  work_life?: number; // -1 (work-focused) to 1 (life-focused)
  tech_relationship?: string; // "heavy" | "moderate" | "minimal"
}

export interface CurrentContextProfile {
  life_stage?: string; // "student" | "early_career" | "parent" | "retired"
  challenges?: string[];
  recent_events?: string[];
  mood?: string;
  concerns?: string[];
}

export interface SelfPerceptionProfile {
  strengths?: string[];
  weaknesses?: string[];
  desired_changes?: string[];
  misunderstandings?: string[];
  confidence?: number; // -1 to 1
}

export interface BoundariesProfile {
  personal?: string[];
  support_needs?: string[];
  alone_time_needs?: string;
  deal_breakers?: string[];
  respect_triggers?: string[];
}

export interface HistoryProfile {
  defining_moments?: string[];
  influences?: string[];
  hardships?: string[];
  regrets?: string[];
  lessons?: string[];
}

export interface MetaBehaviorProfile {
  topics_avoid?: string[];
  topics_love?: string[];
  consistency?: string;
  self_awareness?: number; // -1 to 1
  disagreement_response?: string; // "defensive" | "curious" | "withdraw"
  assumptions?: string[];
}

// Main UserProfile interface
export interface IUserProfile {
  userId: Types.ObjectId;
  identity?: IdentityProfile;
  personality?: PersonalityProfile;
  values?: ValuesProfile;
  goals?: GoalsProfile;
  interests?: InterestsProfile;
  relationships?: RelationshipsProfile;
  emotional?: EmotionalProfile;
  communication?: CommunicationProfile;
  thinking?: ThinkingProfile;
  daily_life?: DailyLifeProfile;
  current_context?: CurrentContextProfile;
  self_perception?: SelfPerceptionProfile;
  boundaries?: BoundariesProfile;
  history?: HistoryProfile;
  meta_behavior?: MetaBehaviorProfile;
  updated_at?: Date;
  version?: number;
}

export interface IUserProfileDocument extends IUserProfile, Document {}

export interface IUserProfileLean extends IUserProfile {
  _id: Types.ObjectId;
  __v?: number;
}

// Method parameter interfaces
export interface UpdateProfileParams {
  userId: string | Types.ObjectId;
  updates: Partial<IUserProfile>;
}

export interface GetProfileParams {
  userId: string | Types.ObjectId;
  categories?: string[];
}

// Result interfaces
export interface ProfileResult {
  ok: boolean;
  updated?: boolean;
}

export interface FormattedProfileResult {
  formatted: string;
  totalFields: number;
}

// Valid category names for validation
export const PROFILE_CATEGORIES = [
  'identity',
  'personality',
  'values',
  'goals',
  'interests',
  'relationships',
  'emotional',
  'communication',
  'thinking',
  'daily_life',
  'current_context',
  'self_perception',
  'boundaries',
  'history',
  'meta_behavior',
] as const;

export type ProfileCategory = (typeof PROFILE_CATEGORIES)[number];

// Extraction result from LLM
export interface ProfileExtractionResult {
  [category: string]: {
    [field: string]: string | number | string[] | undefined;
  };
}
