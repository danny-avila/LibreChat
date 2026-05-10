import configSchema from '~/schema/config';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createConfigModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(configSchema);
  return mongoose.models.Config || mongoose.model<t.IConfig>('Config', configSchema);
}
