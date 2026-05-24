import skillSyncCredentialSchema from '~/schema/skillSyncCredential';
import type { ISkillSyncCredentialDocument } from '~/types/skillSync';

export function createSkillSyncCredentialModel(mongoose: typeof import('mongoose')) {
  // GitHub skill sync is intentionally app-wide in v1; credentials are referenced by
  // admin-managed config keys and are never returned by tenant-scoped APIs.
  return (
    mongoose.models.SkillSyncCredential ||
    mongoose.model<ISkillSyncCredentialDocument>('SkillSyncCredential', skillSyncCredentialSchema)
  );
}
