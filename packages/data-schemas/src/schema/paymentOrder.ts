import { Schema } from 'mongoose';
import { PAYMENT_ORDER_PROVIDERS, PAYMENT_ORDER_STATUSES } from '~/types';
import type * as t from '~/types';

const paymentOrderSchema = new Schema<t.IPaymentOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: PAYMENT_ORDER_PROVIDERS,
      default: PAYMENT_ORDER_PROVIDERS[0],
      required: true,
      index: true,
    },
    outTradeNo: {
      type: String,
      required: true,
    },
    providerTradeNo: {
      type: String,
      index: true,
    },
    amountCny: {
      type: Number,
      required: true,
    },
    credits: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_ORDER_STATUSES,
      default: PAYMENT_ORDER_STATUSES[0],
      required: true,
      index: true,
    },
    creditedTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      index: true,
    },
    packageId: {
      type: String,
      index: true,
    },
    customAmountCny: {
      type: Number,
    },
    notifiedAt: {
      type: Date,
    },
    queriedAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
    creditedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },
    providerPayload: {
      tradeStatus: {
        type: String,
      },
      notifyId: {
        type: String,
      },
      gatewayHost: {
        type: String,
      },
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

paymentOrderSchema.index({ outTradeNo: 1, tenantId: 1 }, { unique: true });
paymentOrderSchema.index({ provider: 1, providerTradeNo: 1, tenantId: 1 });
paymentOrderSchema.index({ user: 1, status: 1, tenantId: 1 });

export default paymentOrderSchema;