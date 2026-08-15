import type { Types } from 'mongoose';
import type { DrainedSearchEvent, SearchEventInput } from '~/search/events';
import {
  deleteSearchEvents,
  dedupeSearchEvents,
  enqueueSearchEvents,
  readSearchEvents,
  searchEnqueueEnabled,
  searchSyncEnabled,
} from '~/search/events';

export interface SearchEventMethods {
  /**
   * Appends projection events for records the hooks cannot see. Bulk writes skip
   * Mongoose middleware entirely, so import and central deletion paths call this
   * directly rather than relying on the seam.
   */
  enqueueSearchEvents(events: readonly SearchEventInput[]): Promise<number>;
  readSearchEvents(limit: number): Promise<readonly DrainedSearchEvent[]>;
  deleteSearchEvents(ids: readonly Types.ObjectId[]): Promise<void>;
  dedupeSearchEvents(events: readonly DrainedSearchEvent[]): readonly DrainedSearchEvent[];
  searchEnqueueEnabled(): boolean;
  searchSyncEnabled(): boolean;
}

export function createSearchEventMethods(mongoose: typeof import('mongoose')): SearchEventMethods {
  return {
    enqueueSearchEvents: (events) => enqueueSearchEvents(mongoose, events),
    readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
    deleteSearchEvents: (ids) => deleteSearchEvents(mongoose, ids),
    dedupeSearchEvents,
    searchEnqueueEnabled,
    searchSyncEnabled,
  };
}
