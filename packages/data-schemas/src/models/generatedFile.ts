import { Model } from 'mongoose';
import type { IGeneratedFile } from '~/types/generatedFile';
import generatedFileSchema from '~/schema/generatedFile';

export function createGeneratedFileModel(mongoose: typeof import('mongoose')): Model<IGeneratedFile> {
  return mongoose.models.GeneratedFile || mongoose.model<IGeneratedFile>('GeneratedFile', generatedFileSchema);
}
