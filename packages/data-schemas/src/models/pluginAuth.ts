import pluginAuthSchema from '~/schema/pluginAuth';
import type { IPluginAuth } from '~/types/pluginAuth';

/**
 * Creates or returns the PluginAuth model using the provided mongoose instance and schema
 */
export function createPluginAuthModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.PluginAuth || mongoose.model<IPluginAuth>('PluginAuth', pluginAuthSchema);
}
