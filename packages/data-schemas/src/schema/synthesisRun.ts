import { Schema } from 'mongoose';
import type { ISynthesisRun } from '~/types/synthesisRun';

const synthesisRunSchema: Schema<ISynthesisRun> = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  scope: {
    type: String,
    enum: ['global', 'project'],
    required: true,
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'UserProject',
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    required: true,
  },
  conversationsProcessed: {
    type: Number,
    default: 0,
  },
  memoriesCreated: {
    type: Number,
    default: 0,
  },
  memoriesUpdated: {
    type: Number,
    default: 0,
  },
  memoriesDeleted: {
    type: Number,
    default: 0,
  },
  error: {
    type: String,
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
  },
});

synthesisRunSchema.index({ userId: 1, scope: 1, projectId: 1 });

export default synthesisRunSchema;
