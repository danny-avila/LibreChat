import { Schema } from 'mongoose';
import type { MediaStoredPreset } from '~/types/mediaPreset';

const mediaPresetSchema: Schema<MediaStoredPreset> = new Schema(
  {
    schemaVersion: { type: Number, required: true, default: 1 as const },
    tenantId: { type: String, default: null },
    ownerId: { type: String, required: true },
    presetId: { type: String, required: true },
    title: { type: String, required: true },
    isDefault: { type: Boolean, required: true, default: false },
    settings: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    version: { type: Number, required: true, default: 1 as const },
  },
  { minimize: false, versionKey: false },
);
mediaPresetSchema.index({ tenantId: 1, ownerId: 1, presetId: 1 }, { unique: true });
mediaPresetSchema.index({ tenantId: 1, ownerId: 1, isDefault: 1 });
export default mediaPresetSchema;
