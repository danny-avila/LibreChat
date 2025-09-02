import pluginAuthSchema, { IPluginAuth } from '~/schema/pluginAuth';

/**
 * Creates or returns the PluginAuth model using the provided mongoose instance and schema
 */
export function createPluginAuthModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.PluginAuth || mongoose.model<IPluginAuth>('PluginAuth', pluginAuthSchema);
}
