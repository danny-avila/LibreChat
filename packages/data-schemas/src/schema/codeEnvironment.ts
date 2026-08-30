import { Schema } from 'mongoose';
import type { CodeEnvironmentDocument } from '~/types';

const workerPrincipalSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['deployment', 'tenant', 'user', 'role', 'group'],
      required: true,
    },
    id: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const codeEnvironmentSchema: Schema<CodeEnvironmentDocument> = new Schema<CodeEnvironmentDocument>(
  {
    environmentId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['managed', 'attached'],
      required: true,
    },
    baseURL: {
      type: String,
      required: true,
    },
    controlPlaneId: {
      type: String,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ownerSlot: {
      type: Number,
      min: 0,
    },
    pendingAgentReferences: {
      type: [String],
      default: undefined,
    },
    deletionStartedAt: {
      type: Date,
    },
    revocationPendingAt: {
      type: Date,
    },
    revocationAttempts: {
      type: Number,
      min: 0,
    },
    revocationLastError: {
      type: String,
    },
    workerId: {
      type: String,
    },
    controlPlaneId: {
      type: String,
    },
    revocationTokenEnv: {
      type: String,
    },
    workerPrincipal: {
      type: workerPrincipalSchema,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

codeEnvironmentSchema.index({ environmentId: 1, tenantId: 1 }, { unique: true });
codeEnvironmentSchema.index({ updatedAt: -1, _id: 1 });

export default codeEnvironmentSchema;
