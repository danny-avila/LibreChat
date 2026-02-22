import { Schema } from 'mongoose';
import type { IMemoryDocument } from '~/types/memoryDocument';

const memoryDocumentSchema: Schema<IMemoryDocument> = new Schema(
  {
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
    content: {
      type: String,
      default: '',
    },
    tokenCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

memoryDocumentSchema.index({ userId: 1, scope: 1, projectId: 1 }, { unique: true });

export default memoryDocumentSchema;
