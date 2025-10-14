import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISharedLink extends Document {
  conversationId: string;
  title?: string;
  user?: string;
  messages?: Types.ObjectId[];
  shareId?: string;
  targetMessageId?: string;
  isPublic: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const shareSchema: Schema<ISharedLink> = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      index: true,
    },
    user: {
      type: String,
      index: true,
    },
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    shareId: {
      type: String,
      index: true,
    },
    targetMessageId: {
      type: String,
      required: false,
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

shareSchema.index({ conversationId: 1, user: 1, targetMessageId: 1 });

export default shareSchema;
