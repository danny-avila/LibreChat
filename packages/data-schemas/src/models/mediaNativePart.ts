import type { Model } from 'mongoose';
import type { MediaNativePartRecord } from '~/types/mediaNative';
import { applyTenantIsolation } from './plugins/tenantIsolation';
import mediaNativePartSchema from '~/schema/mediaNativePart';

export function createMediaNativePartModel(
  mongoose: typeof import('mongoose'),
): Model<MediaNativePartRecord> {
  applyTenantIsolation(mediaNativePartSchema);
  return (
    mongoose.models.MediaNativePart ||
    mongoose.model<MediaNativePartRecord>('MediaNativePart', mediaNativePartSchema)
  );
}
