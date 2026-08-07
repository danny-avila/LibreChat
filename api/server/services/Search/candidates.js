const { logger } = require('@librechat/data-schemas');

/**
 * Route-side search adapter.
 *
 * The search branch lives here rather than inside the persistence methods:
 * `packages/data-schemas` depends only on `librechat-data-provider` and cannot
 * import the search module, so a method that resolved its own candidates would
 * hard-wire this package to one search store forever. The methods now take
 * externally resolved candidate ids and own only filtering, ordering and
 * pagination over the primary store.
 *
 * Every helper returns `undefined` for "not a search" and `[]` for "searched,
 * matched nothing" — the distinction the methods rely on to tell an unfiltered
 * listing from an empty result.
 */

/** Set by the boot wiring once chat search is configured. */
let chatSearch = null;

function setChatSearch(instance) {
  chatSearch = instance;
}

function getChatSearch() {
  return chatSearch;
}

/**
 * Resolves candidate ids for one search target.
 *
 * Scope is never passed in: the search module re-derives it from the request
 * context, so a route cannot widen it by mistake. Returns `[]` rather than
 * throwing when search is unavailable, so a degraded search store yields an
 * empty result set instead of a 500 — matching how shared-link search already
 * failed soft, and fixing conversation search, which used to 500.
 *
 * Listing filters are passed *into* the search rather than applied to its
 * output. Applied afterwards they truncate first and filter second, so a page
 * whose candidates are all archived comes back empty while matching
 * conversations sit one rank below the cut, with no cursor to reach them.
 *
 * @param {'messages'|'conversations'|'shared-links'} target
 * @param {string} query
 * @param {{ cursor?: string, limit?: number, filters?: { archived?: boolean, tags?: string[], projectId?: string } }} [options]
 * @returns {Promise<{ recordIds: string[], conversationIds: string[], nextCursor: string|null }>}
 */
async function resolveCandidates(target, query, options = {}) {
  const empty = { recordIds: [], conversationIds: [], nextCursor: null };
  if (!chatSearch || !query || !query.trim()) {
    return empty;
  }

  try {
    const result = await chatSearch.search({
      target,
      query,
      limit: options.limit ?? 50,
      cursor: options.cursor,
      filters: options.filters,
    });

    const recordIds = [];
    const conversationIds = [];
    for (const hit of result.hits) {
      recordIds.push(hit.recordId);
      if (hit.conversationId) {
        conversationIds.push(hit.conversationId);
      }
    }
    return { recordIds, conversationIds, nextCursor: result.nextCursor };
  } catch (error) {
    logger.error('[searchCandidates] candidate resolution failed', error);
    return empty;
  }
}

module.exports = { resolveCandidates, setChatSearch, getChatSearch };
