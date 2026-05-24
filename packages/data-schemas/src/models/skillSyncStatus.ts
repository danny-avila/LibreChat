import skillSyncStatusSchema from '~/schema/skillSyncStatus';
import type { ISkillSyncStatusDocument } from '~/types/skillSync';

export function createSkillSyncStatusModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.SkillSyncStatus ||
    mongoose.model<ISkillSyncStatusDocument>('SkillSyncStatus', skillSyncStatusSchema)
  );
}
