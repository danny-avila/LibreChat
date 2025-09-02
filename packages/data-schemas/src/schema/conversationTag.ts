import { Schema, Document } from 'mongoose';

export interface IConversationTag extends Document {
  tag?: string;
  user?: string;
  description?: string;
  count?: number;
  position?: number;
}

const conversationTag = new Schema<IConversationTag>(
  {
    tag: {
      type: String,
      index: true,
    },
    user: {
      type: String,
      index: true,
    },
    description: {
      type: String,
      index: true,
    },
    count: {
      type: Number,
      default: 0,
    },
    position: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true },
);

// Create a compound index on tag and user with unique constraint.
conversationTag.index({ tag: 1, user: 1 }, { unique: true });

export default conversationTag;
