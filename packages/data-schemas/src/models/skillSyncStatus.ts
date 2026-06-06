import type { ISkillSyncStatusDocument } from '~/types/skillSync';
import skillSyncStatusSchema from '~/schema/skillSyncStatus';

export function createSkillSyncStatusModel(mongoose: typeof import('mongoose')) {
  // GitHub skill sync status supports app-wide YAML sources and tenant-scoped
  // resolved config sources from admin overrides.
  return (
    mongoose.models.SkillSyncStatus ||
    mongoose.model<ISkillSyncStatusDocument>('SkillSyncStatus', skillSyncStatusSchema)
  );
}
