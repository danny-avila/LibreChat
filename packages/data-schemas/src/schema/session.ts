import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISession extends Document {
  refreshTokenHash: string;
  expiration: Date;
  user: Types.ObjectId;
}

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
});

export default sessionSchema;
