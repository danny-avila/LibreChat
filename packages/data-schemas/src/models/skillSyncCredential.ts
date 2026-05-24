import skillSyncCredentialSchema from '~/schema/skillSyncCredential';
import type { ISkillSyncCredentialDocument } from '~/types/skillSync';

export function createSkillSyncCredentialModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.SkillSyncCredential ||
    mongoose.model<ISkillSyncCredentialDocument>('SkillSyncCredential', skillSyncCredentialSchema)
  );
}
