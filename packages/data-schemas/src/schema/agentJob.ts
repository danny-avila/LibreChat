import { Schema } from 'mongoose';
import type { IAgentJobDocument, IAgentJobStep, IAgentJobClientOp } from '~/types/agentJob';

const GOAL_MAX_LENGTH = 100_000;
const DEFAULT_MAX_STEPS = 25;

const agentJobStepSchema = new Schema<IAgentJobStep>(
  {
    index: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['running', 'success', 'error'],
      required: true,
    },
    summary: {
      type: String,
    },
    messageId: {
      type: String,
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
  },
  { _id: false },
);

const agentJobClientOpSchema = new Schema<IAgentJobClientOp>(
  {
    op: {
      type: String,
      enum: ['listDir', 'readFile', 'writeFile'],
      required: true,
    },
    path: {
      type: String,
    },
    contentRef: {
      type: String,
    },
  },
  { _id: false },
);

const agentJobSchema: Schema<IAgentJobDocument> = new Schema(
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
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    goal: {
      type: String,
      required: true,
      maxlength: [GOAL_MAX_LENGTH, `Goal cannot exceed ${GOAL_MAX_LENGTH} characters`],
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
    status: {
      type: String,
      enum: ['queued', 'running', 'waiting_client', 'paused', 'done', 'error', 'canceled'],
      default: 'queued',
      index: true,
    },
    steps: {
      type: [agentJobStepSchema],
      default: [],
    },
    currentStep: {
      type: Number,
      default: 0,
    },
    maxSteps: {
      type: Number,
      default: DEFAULT_MAX_STEPS,
    },
    checkpoint: {
      type: Schema.Types.Mixed,
    },
    pendingClientOp: {
      type: agentJobClientOpSchema,
      default: null,
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

/** Due-job scan: the worker queries runnable jobs, oldest updated first. */
agentJobSchema.index({ status: 1, lockedAt: 1 });
agentJobSchema.index({ user: 1, tenantId: 1 });

export default agentJobSchema;
