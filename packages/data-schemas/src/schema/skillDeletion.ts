import { Schema } from 'mongoose';
import type { ISkillDeletionDocument } from '~/types/skillDeletion';

const skillDeletionSchema: Schema<ISkillDeletionDocument> = new Schema<ISkillDeletionDocument>(
  {
    skillId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    author: { type: Schema.Types.ObjectId, required: true },
    tenantId: { type: String, index: true },
    startedAt: { type: Date, required: true },
    lastAttemptAt: Date,
    completedAt: Date,
    claimOwner: String,
    claimExpiresAt: Date,
  },
  { timestamps: true },
);

skillDeletionSchema.index({ completedAt: 1, claimExpiresAt: 1, updatedAt: 1 });

export default skillDeletionSchema;
