import { Model } from 'mongoose';
import type { IVoiceProfile } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import voiceProfileSchema from '~/schema/voiceProfile';

export function createVoiceProfileModel(mongoose: typeof import('mongoose')): Model<IVoiceProfile> {
  applyTenantIsolation(voiceProfileSchema);
  return mongoose.models.VoiceProfile || mongoose.model<IVoiceProfile>('VoiceProfile', voiceProfileSchema);
}
