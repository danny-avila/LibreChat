import { Schema } from 'mongoose';
import type { IAccessRole } from '~/types';

const accessRoleSchema = new Schema<IAccessRole>(
  {
    accessRoleId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    resourceType: {
      type: String,
      enum: ['agent', 'project', 'file', 'promptGroup', 'mcpServer', 'remoteAgent'],
      required: true,
      default: 'agent',
    },
    permBits: {
      type: Number,
      required: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

accessRoleSchema.index({ accessRoleId: 1, tenantId: 1 }, { unique: true });

export default accessRoleSchema;
