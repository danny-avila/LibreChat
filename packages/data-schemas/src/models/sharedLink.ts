import { Model } from 'mongoose';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import { applySearchSync } from '~/models/plugins/projection';
import shareSchema, { ISharedLink } from '~/schema/share';

export function createSharedLinkModel(mongoose: typeof import('mongoose')): Model<ISharedLink> {
  applyTenantIsolation(shareSchema);
  /** Shared links have never had a Meilisearch index of their own — their search
   * rides the convos index — so this schema carries the enqueue seam with no sink. */
  applySearchSync(shareSchema, { mongoose, kind: 'shared-link', primaryKey: 'shareId' });
  return mongoose.models.SharedLink || mongoose.model<ISharedLink>('SharedLink', shareSchema);
}
