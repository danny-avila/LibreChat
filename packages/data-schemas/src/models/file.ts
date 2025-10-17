import type { IMongoFile } from '~/types';
import fileSchema from '~/schema/file';

/**
 * Creates or returns the File model using the provided mongoose instance and schema
 */
export function createFileModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.File || mongoose.model<IMongoFile>('File', fileSchema);
}
