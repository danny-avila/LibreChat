import { Schema } from 'mongoose';
import type { IInteraction } from '~/types/interaction';

const interactionSchema: Schema<IInteraction> = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: false,
      index: true,
    },
    promptLength: {
      type: Number,
      required: true,
      min: 0,
    },
    responseLength: {
      type: Number,
      required: true,
      min: 0,
    },
    latencyMs: {
      type: Number,
      required: true,
      min: 0,
    },
    provider: {
      type: String,
      required: true,
      enum: ['mock'],
      default: 'mock',
    },
    status: {
      type: String,
      required: true,
      enum: ['success', 'error'],
      default: 'success',
    },
  },
  { timestamps: true },
);

interactionSchema.index({ createdAt: -1 });
interactionSchema.index({ userId: 1, createdAt: -1 });

export default interactionSchema;