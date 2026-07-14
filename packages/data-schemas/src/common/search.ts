/**
 * Max hits requested from MeiliSearch in a single search call.
 *
 * Tracks MeiliSearch's default `maxTotalHits` index setting (1000): `limit` is
 * clamped to it server-side, so asking for more returns no more without also
 * raising `maxTotalHits`. This is therefore a soft ceiling on how many matching
 * conversations/messages a search can surface; queries matching beyond it are
 * silently truncated.
 */
export const MEILI_SEARCH_LIMIT = 1000;
