import paymentOrderSchema from '~/schema/paymentOrder';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createPaymentOrderModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(paymentOrderSchema);
  return (
    mongoose.models.PaymentOrder ||
    mongoose.model<t.IPaymentOrder>('PaymentOrder', paymentOrderSchema)
  );
}