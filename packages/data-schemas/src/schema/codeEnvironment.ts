import { Schema } from 'mongoose';
import type { CodeEnvironmentDocument } from '~/types';

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
    workerId: {
      type: String,
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
