import { Model } from 'mongoose';
import type { IVoiceProfile } from '~/types';
import voiceProfileSchema from '~/schema/voiceProfile';

export function createVoiceProfileModel(mongoose: typeof import('mongoose')): Model<IVoiceProfile> {
  return mongoose.models.VoiceProfile || mongoose.model<IVoiceProfile>('VoiceProfile', voiceProfileSchema);
}
