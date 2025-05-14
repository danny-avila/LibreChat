import { Schema, Document, Types } from 'mongoose';

export interface IBalance extends Document {
  user: Types.ObjectId;
  tokenCredits: number;
  // Automatic refill settings
  autoRefillEnabled: boolean;
  refillIntervalValue: number;
  refillIntervalUnit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  lastRefill: Date;
  refillAmount: number;
}

const balanceSchema = new Schema<IBalance>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  // 1000 tokenCredits = 1 mill ($0.001 USD)
  tokenCredits: {
    type: Number,
    default: 0,
  },
  // Automatic refill settings
  autoRefillEnabled: {
    type: Boolean,
    default: false,
  },
  refillIntervalValue: {
    type: Number,
    default: 30,
  },
  refillIntervalUnit: {
    type: String,
    enum: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'],
    default: 'days',
  },
  lastRefill: {
    type: Date,
    default: Date.now,
  },
  // amount to add on each refill
  refillAmount: {
    type: Number,
    default: 0,
  },
});

export default balanceSchema;
