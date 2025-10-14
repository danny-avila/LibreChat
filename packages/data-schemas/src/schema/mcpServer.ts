import { Schema } from 'mongoose';
import type { MCPServerDocument } from '~/types';

const mcpServerSchema = new Schema<MCPServerDocument>(
  {
    mcp_id: {
      type: String,
      index: true,
      unique: true,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: Schema.Types.Mixed,
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

mcpServerSchema.index({ updatedAt: -1, _id: 1 });

export default mcpServerSchema;
