import { Schema } from 'mongoose';
import type { ISkillSyncStatusDocument } from '~/types/skillSync';

const skillSyncStatusSchema: Schema<ISkillSyncStatusDocument> = new Schema(
  {
    provider: {
      type: String,
      enum: ['github'],
      required: true,
      index: true,
    },
    sourceId: {
      type: String,
      required: true,
      maxlength: 128,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: ['idle', 'running', 'succeeded', 'failed', 'skipped'],
      default: 'idle',
      required: true,
    },
    credentialKey: {
      type: String,
    },
    owner: {
      type: String,
    },
    repo: {
      type: String,
    },
    ref: {
      type: String,
    },
    paths: {
      type: [String],
      default: undefined,
    },
    startedAt: {
      type: Date,
    },
    finishedAt: {
      type: Date,
    },
    lastSuccessAt: {
      type: Date,
    },
    lastFailureAt: {
      type: Date,
    },
    errorCode: {
      type: String,
    },
    errorMessage: {
      type: String,
    },
    syncedSkillCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    syncedFileCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deletedSkillCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deletedFileCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockOwner: {
      type: String,
    },
    lockExpiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

skillSyncStatusSchema.index({ provider: 1, sourceId: 1, tenantId: 1 }, { unique: true });

export default skillSyncStatusSchema;
