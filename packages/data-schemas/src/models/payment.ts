import { Model } from 'mongoose';
import type * as t from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import paymentSchema from '~/schema/payment';

export function createPaymentModel(mongoose: typeof import('mongoose')): Model<t.IPayment> {
  applyTenantIsolation(paymentSchema);
  return mongoose.models.Payment || mongoose.model<t.IPayment>('Payment', paymentSchema);
}