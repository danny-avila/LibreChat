import { Model } from 'mongoose';
import type { ISearchEvent } from '~/schema/searchevent';
import searchEventSchema from '~/schema/searchevent';

/**
 * The queue is intentionally *not* tenant-isolated: the projector reads it as a
 * cross-tenant background consumer, and every event already carries its own
 * normalized `tenantId` that the projector applies to the destination row.
 */
export function createSearchEventModel(mongoose: typeof import('mongoose')): Model<ISearchEvent> {
  return (
    (mongoose.models.SearchEvent as Model<ISearchEvent>) ||
    mongoose.model<ISearchEvent>('SearchEvent', searchEventSchema)
  );
}
