import { Schema } from 'mongoose';
import type * as t from '~/types';

const paymentSchema: Schema<t.IPayment> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    provider: {
      type: String,
      enum: ['stripe'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'credited', 'failed'],
      required: true,
      default: 'pending',
    },
    currency: {
      type: String,
      required: true,
      default: 'usd',
    },
    requestedUsd: {
      type: Number,
      required: true,
    },
    usdAmount: {
      type: Number,
    },
    credits: {
      type: Number,
    },
    amountTotalCents: {
      type: Number,
    },
    checkoutSessionId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    paymentIntentId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    providerEventId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    error: {
      type: String,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export default paymentSchema;