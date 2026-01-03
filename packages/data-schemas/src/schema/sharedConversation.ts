import mongoose, { Schema, Document } from 'mongoose';

export interface ISharedConversation extends Document {
  conversationId: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  sharedWithUserId: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const sharedConversationSchema: Schema<ISharedConversation> = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    ownerName: {
      type: String,
    },
    ownerEmail: {
      type: String,
    },
    sharedWithUserId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
    },
  },
  { timestamps: true },
);

// Compound index to ensure unique sharing relationship
sharedConversationSchema.index(
  { conversationId: 1, sharedWithUserId: 1 },
  { unique: true },
);

// Index for finding all conversations shared with a user
sharedConversationSchema.index({ sharedWithUserId: 1, updatedAt: -1 });

// Index for finding all shares for a specific conversation
sharedConversationSchema.index({ conversationId: 1, ownerId: 1 });

export default sharedConversationSchema;
