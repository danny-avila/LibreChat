import shareSchema, { ISharedLink } from '~/schema/share';

/**
 * Creates or returns the SharedLink model using the provided mongoose instance and schema
 */
export function createSharedLinkModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.SharedLink || mongoose.model<ISharedLink>('SharedLink', shareSchema);
}
