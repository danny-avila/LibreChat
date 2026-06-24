import { Schema } from 'mongoose';
import type { ISkillScheduleDocument } from '~/types/skillSchedule';

const NAME_MAX_LENGTH = 128;
const PROMPT_MAX_LENGTH = 100_000;

const skillScheduleSchema: Schema<ISkillScheduleDocument> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: [NAME_MAX_LENGTH, `Name cannot exceed ${NAME_MAX_LENGTH} characters`],
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    prompt: {
      type: String,
      required: true,
      maxlength: [PROMPT_MAX_LENGTH, `Prompt cannot exceed ${PROMPT_MAX_LENGTH} characters`],
    },
    skillName: {
      type: String,
    },
    skillId: {
      type: Schema.Types.ObjectId,
      ref: 'Skill',
    },
    agent_id: {
      type: String,
    },
    endpoint: {
      type: String,
    },
    endpointType: {
      type: String,
    },
    model: {
      type: String,
    },
    spec: {
      type: String,
    },
    scheduleType: {
      type: String,
      enum: ['once', 'recurring'],
      required: true,
    },
    cron: {
      type: String,
    },
    runAt: {
      type: Date,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    nextRunAt: {
      type: Date,
      default: null,
    },
    lastRunAt: {
      type: Date,
    },
    lastConversationId: {
      type: String,
    },
    lastStatus: {
      type: String,
      enum: ['pending', 'running', 'success', 'error'],
      default: 'pending',
    },
    lastError: {
      type: String,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/** Due-job scan: poller queries enabled schedules whose nextRunAt has passed. */
skillScheduleSchema.index({ enabled: 1, nextRunAt: 1 });
skillScheduleSchema.index({ user: 1, tenantId: 1 });

export default skillScheduleSchema;
