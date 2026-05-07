import { Mongoose, Model } from 'mongoose';
import impersonationTokenSchema, { IMongoImpersonationToken } from '~/schema/impersonationToken';

/**
 * Creates or returns the ImpersonationToken model using the provided mongoose instance and schema
 */
export function createImpersonationTokenModel(mongoose: Mongoose): Model<IMongoImpersonationToken> {
  return (
    (mongoose.models.ImpersonationToken as Model<IMongoImpersonationToken>) ||
    mongoose.model<IMongoImpersonationToken>('ImpersonationToken', impersonationTokenSchema)
  );
}
