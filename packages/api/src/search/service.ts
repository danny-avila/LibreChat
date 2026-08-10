import { logger, resolveScope } from '@librechat/data-schemas';
import type { ChatSearch, SearchPool } from './types';
import type { SnapshotStore } from './cursor';
import type { QueryEmbedder } from './search';
import { createKeyvSnapshotStore, createMemorySnapshotStore } from './cursor';
import { MeiliChatSearch, meiliSearchConfigured } from './meili';
import { cacheConfig, standardCache } from '../cache';
import { PostgresChatSearch } from './search';
import { createSearchPool } from './pool';

/**
 * Not a `CacheKeys` member on purpose: the namespace is internal to chat-search
 * pagination, never operator-tuned, and the enum is the shared app-config
 * surface.
 */
const SNAPSHOT_CACHE_NAMESPACE = 'CHAT_SEARCH_SNAPSHOTS';

/**
 * Pagination snapshots live in the shared cache whenever Redis is configured:
 * the in-process store is per-pod, and a next-page request that lands on a
 * different pod would miss its snapshot and serve page one again under a fresh
 * cursor. Without Redis the bounded in-process store remains and single-pod
 * behaviour is unchanged. The shared-store property is pinned in
 * `search.spec.ts`, 'continues pagination on a second instance through a
 * shared snapshot store'.
 */
function productionSnapshotStore(): SnapshotStore {
  if (!cacheConfig.USE_REDIS) {
    return createMemorySnapshotStore();
  }
  return createKeyvSnapshotStore(standardCache(SNAPSHOT_CACHE_NAMESPACE));
}

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
 * secret with the feature switched on is an operator error, and surfacing it at
 * boot beats surfacing it on someone's first paginated search. The caller
 * decides how loud that is; the server logs it and keeps serving without search
 * rather than refusing to start.
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
    snapshots: productionSnapshotStore(),
  });

  logger.info('[chatSearch] PostgreSQL chat search is enabled');
  if (!options.embedder) {
    /**
     * Said once, at boot, rather than left for someone to infer from empty
     * vector results. Nothing writes embeddings yet either — `writeEmbedding`
     * has no production caller — so the arm is inert end to end, and every
     * search additionally reports `embedding-unconfigured` so the state is
     * visible per query and not only in a startup log nobody re-reads.
     */
    logger.info(
      '[chatSearch] no query embedder is configured: serving the lexical arms only ' +
        '(exact, trigram, full-text). Semantic ranking is inactive.',
    );
  }

  return Object.freeze({
    chatSearch,
    async close(): Promise<void> {
      if (!options.pool) {
        await pool.end().catch(() => undefined);
      }
    },
  });
}
