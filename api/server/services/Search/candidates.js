const { logger } = require('@librechat/data-schemas');
const { CANDIDATE_CAP } = require('@librechat/api');

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
 * The routes own the "not a search" / "searched, matched nothing" distinction:
 * they pass `undefined` to the methods for the former and this adapter's `[]`
 * for the latter, which is what lets a method tell an unfiltered listing from
 * an empty result.
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
 * `limit` defaults to the whole fused candidate window rather than one page. A
 * listing paginates in the primary store, where its sort and its cursor
 * semantics live, so it needs every candidate at once: handed only `limit` ids,
 * the primary store's `limit + 1` has-more test can never fire and every search
 * result is permanently single-page.
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
      limit: options.limit ?? CANDIDATE_CAP,
      cursor: options.cursor,
      filters: options.filters,
    });

    if (result.degradations?.length) {
      /**
       * The one place every search flows through, so the one place a degraded
       * arm is visible at all — the routes never read `degradations`, and a
       * vector arm that silently contributes nothing looks exactly like one
       * that matched nothing. Debug level: this repeats per search, not per
       * incident.
       */
      logger.debug(
        `[searchCandidates] degraded search (${target}): ${result.degradations.join(', ')}`,
      );
    }

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
