import { Schema } from 'mongoose';
import type { IGeneratedFile } from '~/types/generatedFile';

const generatedFile: Schema<IGeneratedFile> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    conversationId: {
      type: String,
      ref: 'Conversation',
      index: true,
    },
    messageId: {
      type: String,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    filepath: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ['pdf', 'markdown', 'image'],
      required: true,
    },
    source: {
      type: String,
      enum: ['document_generator', 'image_generation'],
      required: true,
    },
    title: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

generatedFile.index({ user: 1, createdAt: -1 });
generatedFile.index({ conversationId: 1, createdAt: -1 });

export default generatedFile;
