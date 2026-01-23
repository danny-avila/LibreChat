import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAgentApiKey extends Document {
  userId: Types.ObjectId;
  name: string;
  keyHash: string;
  keyPrefix: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const agentApiKeySchema: Schema<IAgentApiKey> = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    keyHash: {
      type: String,
      required: true,
    },
    keyPrefix: {
      type: String,
      required: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

agentApiKeySchema.index({ userId: 1, name: 1 });
agentApiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default agentApiKeySchema;
