import { Schema } from 'mongoose';
import type * as t from '~/types';

const balanceSchema = new Schema<t.IBalance>({
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
  // Monthly budget settings (Vermeer "Seuils & gestion") — stored in tokenCredits (1 USD = 1_000_000)
  // monthlyBudget is the current threshold (admin-editable for the ongoing month);
  // monthlyBudgetBaseline is the reference value restored on monthly reset.
  monthlyBudget: {
    type: Number,
    default: 10_000_000,
  },
  monthlyBudgetBaseline: {
    type: Number,
    default: 10_000_000,
  },
  tenantId: {
    type: String,
    index: true,
  },
});

export default balanceSchema;
