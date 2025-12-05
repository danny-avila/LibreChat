import { Schema } from 'mongoose';
import type { IUserProfileDocument } from '~/types/userProfile';

/**
 * Sub-schemas for each profile category
 * All fields are optional for sparse storage
 */

const IdentitySchema = new Schema(
  {
    age: Number,
    location: { type: String, maxlength: 50 },
    occupation: { type: String, maxlength: 50 },
    education: { type: String, maxlength: 100 },
    family: { type: String, maxlength: 50 },
    languages: [{ type: String, maxlength: 20 }],
    cultural_bg: { type: String, maxlength: 50 },
  },
  { _id: false },
);

const PersonalitySchema = new Schema(
  {
    introversion: { type: Number, min: -1, max: 1 },
    planning: { type: Number, min: -1, max: 1 },
    optimism: { type: Number, min: -1, max: 1 },
    risk_tolerance: { type: Number, min: -1, max: 1 },
    emotional_logical: { type: Number, min: -1, max: 1 },
    stress_response: { type: String, maxlength: 30 },
  },
  { _id: false },
);

const ValuesSchema = new Schema(
  {
    priorities: [{ type: String, maxlength: 30 }],
    principles: [{ type: String, maxlength: 30 }],
    success_def: { type: String, maxlength: 100 },
    non_negotiables: [{ type: String, maxlength: 30 }],
    worldview: { type: String, maxlength: 100 },
    spirituality: { type: String, maxlength: 50 },
  },
  { _id: false },
);

const GoalsSchema = new Schema(
  {
    short_term: [{ type: String, maxlength: 50 }],
    long_term: [{ type: String, maxlength: 50 }],
    dreams: [{ type: String, maxlength: 50 }],
    professional: [{ type: String, maxlength: 50 }],
    growth_areas: [{ type: String, maxlength: 30 }],
  },
  { _id: false },
);

const InterestsSchema = new Schema(
  {
    hobbies: [{ type: String, maxlength: 30 }],
    topics: [{ type: String, maxlength: 30 }],
    media: [{ type: String, maxlength: 30 }],
    aesthetics: [{ type: String, maxlength: 30 }],
    niche: [{ type: String, maxlength: 30 }],
  },
  { _id: false },
);

const RelationshipsSchema = new Schema(
  {
    important_people: [{ type: String, maxlength: 50 }],
    attachment: { type: String, maxlength: 20 },
    social_pref: { type: String, maxlength: 20 },
    conflict_style: { type: String, maxlength: 20 },
    love_language: { type: String, maxlength: 20 },
  },
  { _id: false },
);

const EmotionalSchema = new Schema(
  {
    happy_triggers: [{ type: String, maxlength: 30 }],
    frustrations: [{ type: String, maxlength: 30 }],
    fears: [{ type: String, maxlength: 30 }],
    comfort_sources: [{ type: String, maxlength: 30 }],
    pride_points: [{ type: String, maxlength: 30 }],
    vulnerabilities: [{ type: String, maxlength: 30 }],
  },
  { _id: false },
);

const CommunicationSchema = new Schema(
  {
    channels: [{ type: String, maxlength: 20 }],
    directness: { type: Number, min: -1, max: 1 },
    detail_pref: { type: String, maxlength: 20 },
    tone: { type: String, maxlength: 20 },
    feedback_style: { type: String, maxlength: 20 },
    advice_vs_listen: { type: Number, min: -1, max: 1 },
  },
  { _id: false },
);

const ThinkingSchema = new Schema(
  {
    learning_style: { type: String, maxlength: 20 },
    decision_making: { type: String, maxlength: 20 },
    big_picture_detail: { type: Number, min: -1, max: 1 },
    openness_change: { type: Number, min: -1, max: 1 },
    problem_solving: { type: String, maxlength: 20 },
  },
  { _id: false },
);

const DailyLifeSchema = new Schema(
  {
    schedule: { type: String, maxlength: 20 },
    chronotype: { type: String, maxlength: 20 },
    health_habits: [{ type: String, maxlength: 30 }],
    work_life: { type: Number, min: -1, max: 1 },
    tech_relationship: { type: String, maxlength: 20 },
  },
  { _id: false },
);

const CurrentContextSchema = new Schema(
  {
    life_stage: { type: String, maxlength: 30 },
    challenges: [{ type: String, maxlength: 50 }],
    recent_events: [{ type: String, maxlength: 50 }],
    mood: { type: String, maxlength: 20 },
    concerns: [{ type: String, maxlength: 50 }],
  },
  { _id: false },
);

const SelfPerceptionSchema = new Schema(
  {
    strengths: [{ type: String, maxlength: 30 }],
    weaknesses: [{ type: String, maxlength: 30 }],
    desired_changes: [{ type: String, maxlength: 50 }],
    misunderstandings: [{ type: String, maxlength: 50 }],
    confidence: { type: Number, min: -1, max: 1 },
  },
  { _id: false },
);

const BoundariesSchema = new Schema(
  {
    personal: [{ type: String, maxlength: 50 }],
    support_needs: [{ type: String, maxlength: 30 }],
    alone_time_needs: { type: String, maxlength: 30 },
    deal_breakers: [{ type: String, maxlength: 30 }],
    respect_triggers: [{ type: String, maxlength: 30 }],
  },
  { _id: false },
);

const HistorySchema = new Schema(
  {
    defining_moments: [{ type: String, maxlength: 50 }],
    influences: [{ type: String, maxlength: 50 }],
    hardships: [{ type: String, maxlength: 50 }],
    regrets: [{ type: String, maxlength: 50 }],
    lessons: [{ type: String, maxlength: 50 }],
  },
  { _id: false },
);

const MetaBehaviorSchema = new Schema(
  {
    topics_avoid: [{ type: String, maxlength: 30 }],
    topics_love: [{ type: String, maxlength: 30 }],
    consistency: { type: String, maxlength: 30 },
    self_awareness: { type: Number, min: -1, max: 1 },
    disagreement_response: { type: String, maxlength: 20 },
    assumptions: [{ type: String, maxlength: 50 }],
  },
  { _id: false },
);

/**
 * Main UserProfile Schema
 * One document per user with sparse category fields
 */
const UserProfileSchema: Schema<IUserProfileDocument> = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
      unique: true,
    },
    identity: IdentitySchema,
    personality: PersonalitySchema,
    values: ValuesSchema,
    goals: GoalsSchema,
    interests: InterestsSchema,
    relationships: RelationshipsSchema,
    emotional: EmotionalSchema,
    communication: CommunicationSchema,
    thinking: ThinkingSchema,
    daily_life: DailyLifeSchema,
    current_context: CurrentContextSchema,
    self_perception: SelfPerceptionSchema,
    boundaries: BoundariesSchema,
    history: HistorySchema,
    meta_behavior: MetaBehaviorSchema,
    updated_at: {
      type: Date,
      default: Date.now,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    minimize: false, // Keep empty objects for consistency
  },
);

export default UserProfileSchema;
