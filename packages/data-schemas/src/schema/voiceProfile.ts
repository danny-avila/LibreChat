import { Schema } from 'mongoose';
import type { IVoiceProfile } from '~/types';

const voiceProfileSchema: Schema<IVoiceProfile> = new Schema<IVoiceProfile>(
  {
    name: {
      type: String,
      required: true,
    },
    instruct: {
      type: String,
      required: false,
      default: '',
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
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

voiceProfileSchema.index({ name: 1, tenantId: 1 }, { unique: true });

export default voiceProfileSchema;
