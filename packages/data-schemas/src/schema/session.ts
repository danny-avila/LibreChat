import mongoose, { Schema } from 'mongoose';
import { ISession } from '~/types';

const sessionSchema: Schema<ISession> = new Schema({
  refreshTokenHash: {
    type: String,
    required: true,
  },
  expiration: {
    type: Date,
    required: true,
    expires: 0,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  /** Organizations mode: the login account behind the member in `user`. Revoking an account's
   *  credentials removes the sessions of every organization it belongs to through this field. */
  identity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    sparse: true,
  },
  tenantId: {
    type: String,
    index: true,
  },
});

sessionSchema.index({ user: 1, refreshTokenHash: 1 }, { unique: true });

export default sessionSchema;
