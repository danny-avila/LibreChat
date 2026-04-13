import { Schema } from 'mongoose';
import type { IMagicLink } from '~/types';

const magicLinkSchema: Schema<IMagicLink> = new Schema(
  {
    token: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'user' },
    active: { type: Boolean, default: true },
    userId: { type: Schema.Types.ObjectId, ref: 'user' },
    lastUsedAt: { type: Date },
    useCount: { type: Number, default: 0 },
    tenantId: { type: String, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

magicLinkSchema.index({ token: 1 }, { unique: true });
magicLinkSchema.index(
  { email: 1, tenantId: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
magicLinkSchema.index({ createdBy: 1 });

export default magicLinkSchema;
