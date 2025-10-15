import keySchema, { IKey } from '~/schema/key';

/**
 * Creates or returns the Key model using the provided mongoose instance and schema
 */
export function createKeyModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Key || mongoose.model<IKey>('Key', keySchema);
}
