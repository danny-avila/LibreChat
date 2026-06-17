import type { Document, Types } from 'mongoose';

export type PaymentProvider = 'stripe';
export type PaymentStatus = 'pending' | 'processing' | 'credited' | 'failed';

export interface IPayment extends Document {
  user: Types.ObjectId;
  provider: PaymentProvider;
  status: PaymentStatus;
  currency: string;
  requestedUsd: number;
  usdAmount?: number;
  credits?: number;
  amountTotalCents?: number;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  providerEventId?: string;
  error?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPaymentUpdate {
  user?: string;
  provider?: PaymentProvider;
  status?: PaymentStatus;
  currency?: string;
  requestedUsd?: number;
  usdAmount?: number;
  credits?: number;
  amountTotalCents?: number;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  providerEventId?: string;
  error?: string;
}