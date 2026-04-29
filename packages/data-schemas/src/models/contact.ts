import contactSchema from '~/schema/contact';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IContact } from '~/types';

export function createContactModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(contactSchema);
  return mongoose.models.Contact || mongoose.model<IContact>('Contact', contactSchema);
}
