import shareSchema, { ISharedLink } from '~/schema/share';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createSharedLinkModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(shareSchema);
  return mongoose.models.SharedLink || mongoose.model<ISharedLink>('SharedLink', shareSchema);
}
