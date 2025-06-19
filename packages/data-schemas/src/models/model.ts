import modelSchema, { IModel } from '~/schema/model';

/**
 * Creates or returns the Model model using the provided mongoose instance and schema
 */
export function createModelModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Model || mongoose.model<IModel>('Model', modelSchema);
}
