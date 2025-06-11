import { Schema, Document } from 'mongoose';

export interface IAgentCategory extends Document {
  value: string;
  label: string;
  description?: string;
  order: number;
  isActive: boolean;
}

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