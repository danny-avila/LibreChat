import pluginAuthSchema from '~/schema/pluginAuth';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IPluginAuth } from '~/types/pluginAuth';

export function createPluginAuthModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(pluginAuthSchema);
  return mongoose.models.PluginAuth || mongoose.model<IPluginAuth>('PluginAuth', pluginAuthSchema);
}
