import type { Model } from 'mongoose';
import type { ISkillDeletionDocument } from '~/types/skillDeletion';
import skillDeletionSchema from '~/schema/skillDeletion';

export function createSkillDeletionModel(
  mongoose: typeof import('mongoose'),
): Model<ISkillDeletionDocument> {
  return (
    mongoose.models.SkillDeletion ||
    mongoose.model<ISkillDeletionDocument>('SkillDeletion', skillDeletionSchema)
  );
}
