import { Schema } from 'mongoose';
import type { IPrompt } from '~/types';

const promptSchema: Schema<IPrompt> = new Schema(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'PromptGroup',
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'chat'],
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

promptSchema.index({ createdAt: 1, updatedAt: 1 });

export default promptSchema;
