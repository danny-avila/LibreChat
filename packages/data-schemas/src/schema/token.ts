import { Schema } from 'mongoose';
import { IToken } from '~/types';

const tokenSchema: Schema<IToken> = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'user',
  },
  email: {
    type: String,
  },
  type: {
    type: String,
  },
  identifier: {
    type: String,
  },
  token: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
  },
  tenantId: {
    type: String,
    index: true,
  },
});

tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
tokenSchema.index({ userId: 1, type: 1, identifier: 1, tenantId: 1 });

export default tokenSchema;
