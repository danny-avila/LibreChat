import fileSchema from '~/schema/file';
import type { IMongoFile } from '~/types';

/**
 * Creates or returns the File model using the provided mongoose instance and schema
 */
export function createFileModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.File || mongoose.model<IMongoFile>('File', fileSchema);
}
