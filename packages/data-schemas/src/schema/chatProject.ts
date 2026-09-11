import { Schema } from 'mongoose';
import type { IChatProjectDocument } from '~/types';

const chatProjectSchema: Schema<IChatProjectDocument> = new Schema<IChatProjectDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    instructions: {
      type: String,
      default: '',
    },
    contextRevision: {
      type: Number,
      default: 0,
      min: 0,
    },
    file_ids: {
      type: [String],
      default: [],
    },
    user: {
      type: String,
      required: true,
      index: true,
    },
    conversationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastConversationAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastConversationId: {
      type: String,
      default: null,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

chatProjectSchema.index({ user: 1, name: 1, _id: 1 });
chatProjectSchema.index({ user: 1, createdAt: -1, _id: -1 });
chatProjectSchema.index({ user: 1, lastConversationAt: -1, _id: -1 });

export default chatProjectSchema;
