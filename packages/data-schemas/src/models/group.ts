import groupSchema from '~/schema/group';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createGroupModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(groupSchema);
  return mongoose.models.Group || mongoose.model<t.IGroup>('Group', groupSchema);
}
