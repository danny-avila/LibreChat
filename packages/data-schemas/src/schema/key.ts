import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IKey extends Document {
  userId: Types.ObjectId;
  name: string;
  value: string;
  expiresAt?: Date;
}

const keySchema: Schema<IKey> = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  value: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
  },
});

keySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default keySchema;
