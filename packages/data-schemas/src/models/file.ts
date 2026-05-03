import fileSchema from '~/schema/file';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IMongoFile } from '~/types';

export function createFileModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(fileSchema);
  return mongoose.models.File || mongoose.model<IMongoFile>('File', fileSchema);
}
