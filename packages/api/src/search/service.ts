import { logger, resolveScope } from '@librechat/data-schemas';
import type { ChatSearch, SearchPool } from './types';
import type { QueryEmbedder } from './search';
import { MeiliChatSearch, meiliSearchConfigured } from './meili';
import { PostgresChatSearch } from './search';
import { createSearchPool } from './pool';

/**
 * Boot-time construction of the request-path search backend.
 *
 * Kept here rather than in the Express layer so the decision of *when* chat
 * search is available lives next to the thing that implements it, and so the
 * server wiring stays the thin call it should be.
 */
export type ChatSearchRuntime = Readonly<{
  chatSearch: ChatSearch;
  close(): Promise<void>;
}>;

export type ChatSearchOptions = Readonly<{
  embedder?: QueryEmbedder;
  /** Overrides the pool, for tests that already hold one. */
  pool?: SearchPool;
  /** Required for the Meilisearch fallback, which reads through the models. */
  mongoose?: typeof import('mongoose');
}>;

/**
 * Whether this deployment has opted into PostgreSQL chat search.
 *
 * Both halves are required. `CHAT_SEARCH_ENABLED` alone would have the write
 * path queueing projection events for a store nobody configured, and a URL alone
 * would turn the feature on for anyone who merely pointed at a database.
 */
export function chatSearchConfigured(): boolean {
  return process.env.CHAT_SEARCH_ENABLED === 'true' && !!process.env.CHAT_SEARCH_DATABASE_URL;
}

/**
 * Builds the reader-side chat search, or returns null when this deployment has
 * not configured one.
 *
 * Null is a supported outcome, not a failure: a deployment that never sets the
 * chat-search variables must boot exactly as it did before, which is why nothing
 * here throws on absence. Misconfiguration *does* throw — a missing cursor
 * secret with the feature switched on is an operator error, and failing at boot
 * is far better than failing on the first paginated search.
 *
 * The connection string is the reader role's. The projector's writer URL is
 * deliberately a different variable: a request pod holds no grant that can
 * write to the projection.
 */
export function createChatSearch(options: ChatSearchOptions = {}): ChatSearchRuntime | null {
  if (!chatSearchConfigured()) {
    /**
     * Nothing about this feature has been configured, so fall back to whatever
     * this deployment was already searching with. The routes read candidates
     * through one seam now; without this, upgrading with no new configuration
     * would silently turn every existing Meilisearch deployment's search into an
     * empty result set.
     */
    if (options.mongoose && meiliSearchConfigured()) {
      logger.info('[chatSearch] serving candidates from Meilisearch');
      return Object.freeze({
        chatSearch: new MeiliChatSearch({ mongoose: options.mongoose }),
        close: async (): Promise<void> => undefined,
      });
    }
    return null;
  }

  const pool =
    options.pool ??
    createSearchPool({
      connectionString: process.env.CHAT_SEARCH_DATABASE_URL as string,
      applicationName: 'librechat-chat-search-reader',
    });

  const chatSearch = new PostgresChatSearch({
    pool,
    /**
     * Scope is re-derived from the request context on every call, and never
     * passed in by a route. A background context has no scope and therefore
     * cannot search at all, which is the intended failure.
     */
    resolveScope,
    embedder: options.embedder,
  });

  logger.info('[chatSearch] PostgreSQL chat search is enabled');

  return Object.freeze({
    chatSearch,
    async close(): Promise<void> {
      if (!options.pool) {
        await pool.end().catch(() => undefined);
      }
    },
  });
}
