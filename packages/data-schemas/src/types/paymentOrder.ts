import type { Document, Types } from 'mongoose';

export const PAYMENT_ORDER_PROVIDERS = ['alipay'] as const;
export type PaymentOrderProvider = (typeof PAYMENT_ORDER_PROVIDERS)[number];

export const PAYMENT_ORDER_STATUSES = ['pending', 'paid', 'credited', 'closed', 'failed'] as const;
export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];

export interface IPaymentOrderProviderPayload {
  tradeStatus?: string;
  notifyId?: string;
  gatewayHost?: string;
}

export interface IPaymentOrder extends Document {
  user: Types.ObjectId;
  provider: PaymentOrderProvider;
  outTradeNo: string;
  providerTradeNo?: string;
  amountCny: number;
  credits: number;
  status: PaymentOrderStatus;
  creditedTransactionId?: Types.ObjectId;
  packageId?: string;
  customAmountCny?: number;
  notifiedAt?: Date;
  queriedAt?: Date;
  paidAt?: Date;
  creditedAt?: Date;
  closedAt?: Date;
  providerPayload?: IPaymentOrderProviderPayload;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}