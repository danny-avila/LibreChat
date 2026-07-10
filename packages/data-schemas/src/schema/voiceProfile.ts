import { Schema } from 'mongoose';
import type { IVoiceProfile } from '~/types';

const voiceProfileSchema: Schema<IVoiceProfile> = new Schema<IVoiceProfile>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    instruct: {
      type: String,
      required: true,
    },
    authorizedConfigRoles: {
      type: [String],
      default: ['ADMIN'],
    },
    authorizedConfigGroups: {
      type: [String],
      default: [],
    },
    authorizedUseRoles: {
      type: [String],
      default: ['ADMIN', 'USER'],
    },
    authorizedUseGroups: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export default voiceProfileSchema;
