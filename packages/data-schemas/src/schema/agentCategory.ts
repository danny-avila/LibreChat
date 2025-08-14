import { Schema, Document } from 'mongoose';
import type { IAgentCategory } from '~/types';

const agentCategorySchema = new Schema<IAgentCategory>(
  {
    value: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

agentCategorySchema.index({ isActive: 1, order: 1 });

export default agentCategorySchema;
