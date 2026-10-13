import type { Model } from 'mongoose';
import type { ISkillUploadIntentDocument } from '~/types/skillDeletion';
import skillUploadIntentSchema from '~/schema/skillUploadIntent';

export function createSkillUploadIntentModel(
  mongoose: typeof import('mongoose'),
): Model<ISkillUploadIntentDocument> {
  return (
    mongoose.models.SkillUploadIntent ||
    mongoose.model<ISkillUploadIntentDocument>('SkillUploadIntent', skillUploadIntentSchema)
  );
}
