import presetSchema, { IPreset } from '~/schema/preset';

/**
 * Creates or returns the Preset model using the provided mongoose instance and schema
 */
export function createPresetModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Preset || mongoose.model<IPreset>('Preset', presetSchema);
}
