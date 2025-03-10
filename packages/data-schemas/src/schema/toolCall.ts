import mongoose, { Schema, Document, Types } from 'mongoose';
import type { TAttachment } from 'librechat-data-provider';

export interface IToolCallData extends Document {
  conversationId: string;
  messageId: string;
  toolId: string;
  user: Types.ObjectId;
  result?: unknown;
  attachments?: TAttachment[];
  blockIndex?: number;
  partIndex?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const toolCallSchema: Schema<IToolCallData> = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
    },
    messageId: {
      type: String,
      required: true,
    },
    toolId: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
    },
    attachments: {
      type: mongoose.Schema.Types.Mixed,
    },
    blockIndex: {
      type: Number,
    },
    partIndex: {
      type: Number,
    },
  },
  { timestamps: true },
);

toolCallSchema.index({ messageId: 1, user: 1 });
toolCallSchema.index({ conversationId: 1, user: 1 });

export default toolCallSchema;
