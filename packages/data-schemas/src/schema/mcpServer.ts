import { Schema } from 'mongoose';
import type { MCPServerDocument } from '~/types';

const mcpServerSchema = new Schema<MCPServerDocument>(
  {
    serverName: {
      type: String,
      index: true,
      required: true,
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
      // Config contains: title, description, url, oauth, etc.
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

mcpServerSchema.index({ serverName: 1, tenantId: 1 }, { unique: true });
mcpServerSchema.index({ updatedAt: -1, _id: 1 });

export default mcpServerSchema;
