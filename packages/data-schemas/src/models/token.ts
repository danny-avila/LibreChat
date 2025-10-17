import type * as t from '~/types';
import tokenSchema from '~/schema/token';

/**
 * Creates or returns the Token model using the provided mongoose instance and schema
 */
export function createTokenModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Token || mongoose.model<t.IToken>('Token', tokenSchema);
}
