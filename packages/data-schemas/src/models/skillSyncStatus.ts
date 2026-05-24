import skillSyncStatusSchema from '~/schema/skillSyncStatus';
import type { ISkillSyncStatusDocument } from '~/types/skillSync';

export function createSkillSyncStatusModel(mongoose: typeof import('mongoose')) {
  // GitHub skill sync status is intentionally app-wide in v1, matching the
  // shared synced skills and the single scheduler lock across app processes.
  return (
    mongoose.models.SkillSyncStatus ||
    mongoose.model<ISkillSyncStatusDocument>('SkillSyncStatus', skillSyncStatusSchema)
  );
}
