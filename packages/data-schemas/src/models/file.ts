import mongoose from 'mongoose';
import fileSchema from '~/schema/file';
import type { IMongoFile } from '~/types';

export const File = mongoose.models.File || mongoose.model<IMongoFile>('File', fileSchema);
