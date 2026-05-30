import presetSchema, { IPreset } from '~/schema/preset';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createPresetModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(presetSchema);
  return mongoose.models.Preset || mongoose.model<IPreset>('Preset', presetSchema);
}
