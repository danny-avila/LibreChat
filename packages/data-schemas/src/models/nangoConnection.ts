import nangoConnectionSchema from '~/schema/nangoConnection';
import type * as t from '~/types';

export function createNangoConnectionModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.NangoConnection ||
    mongoose.model<t.INangoConnection>('NangoConnection', nangoConnectionSchema)
  );
}
