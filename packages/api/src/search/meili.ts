import { logger, resolveScope } from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
import type {
  ChatSearch,
  ChatSearchHit,
  ChatSearchRequest,
  ChatSearchResult,
  SearchTarget,
} from './types';

/**
 * Meilisearch as a candidate backend.
 *
 * The route adapter now asks a `ChatSearch` for candidate ids rather than
 * letting each persistence method run its own store query, and Meilisearch is
 * one such store. Expressing it through the same interface is what lets a
 * deployment that has only ever run Meilisearch keep its search working
 * unchanged while PostgreSQL becomes the default for deployments that configure
 * it — one seam, two implementations, no route-level branching.
 *
 * Candidate ids only, exactly as PostgreSQL returns: the caller still hydrates
 * and authorizes every hit against the primary store, so a stale index can cost
 * recall but never visibility.
 */
type MeiliHit = Readonly<{
  conversationId?: unknown;
  messageId?: unknown;
}>;

type MeiliSearchable = {
  meiliSearch(
    query: string,
    params: Record<string, unknown>,
    populate?: boolean,
  ): Promise<{ hits?: readonly MeiliHit[] }>;
};

/**
 * All this backend needs of Mongoose: the registry the Meilisearch statics were
 * attached to. Narrower than the module so the dependency is honest, and so the
 * failure paths can be exercised without a live Meilisearch to fail against.
 */
export type MeiliModelRegistry = Readonly<{
  models: Readonly<Record<string, unknown>>;
}>;

export type MeiliChatSearchDeps = Readonly<{
  mongoose: MeiliModelRegistry;
  resolveScope?: () => Scope;
}>;

/** Message candidates come from the messages index; everything else from convos. */
const TARGET_MODEL: Readonly<Record<SearchTarget, 'Message' | 'Conversation'>> = Object.freeze({
  messages: 'Message',
  conversations: 'Conversation',
  'shared-links': 'Conversation',
});

/**
 * Whether Meilisearch is configured well enough to answer a query.
 *
 * Credentials only. `MEILI_WRITES_ENABLED` gates the *write* path; a deployment
 * that stopped writing to Meilisearch can still read the index it already has.
 */
export function meiliSearchConfigured(): boolean {
  return !!process.env.MEILI_HOST && !!process.env.MEILI_MASTER_KEY;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Meilisearch filter values are double-quoted strings, so a quote or backslash
 * in the value would end the literal early. Ids are opaque here — they are not
 * validated as ObjectIds anywhere on this path — so they are escaped rather
 * than trusted.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

export class MeiliChatSearch implements ChatSearch {
  private readonly deps: MeiliChatSearchDeps;

  constructor(deps: MeiliChatSearchDeps) {
    this.deps = deps;
  }

  /**
   * Reachability, not just configuration.
   *
   * The probe this replaced called Meilisearch's health endpoint, so returning
   * true on credentials alone would newly advertise search on a deployment whose
   * Meilisearch is down. A zero-row query against the index the routes actually
   * read is a stricter signal than `/health` — it proves the index exists and
   * answers, not merely that the server is up.
   */
  async isReady(): Promise<boolean> {
    if (!meiliSearchConfigured()) {
      return false;
    }
    const model = this.model('conversations');
    if (!model) {
      return false;
    }
    try {
      await model.meiliSearch('', { limit: 1 });
      return true;
    } catch (error) {
      logger.error('[chatSearch] Meilisearch readiness probe failed', error);
      return false;
    }
  }

  private model(target: SearchTarget): MeiliSearchable | null {
    const registered = this.deps.mongoose.models[TARGET_MODEL[target]] as
      | Partial<MeiliSearchable>
      | undefined;
    if (!registered || typeof registered.meiliSearch !== 'function') {
      return null;
    }
    return registered as MeiliSearchable;
  }

  /**
   * Scope is re-derived per call and never read from the request, matching the
   * PostgreSQL backend. Meilisearch indexes are keyed by user rather than by
   * tenant, so the user predicate is the whole of the filter — the same one the
   * persistence methods applied before this seam existed.
   */
  async search(request: ChatSearchRequest): Promise<ChatSearchResult> {
    const scope = (this.deps.resolveScope ?? resolveScope)();
    const model = this.model(request.target);
    if (!model) {
      logger.warn('[chatSearch] Meilisearch is configured but its index is not registered');
      return { hits: [], nextCursor: null, degradations: [] };
    }

    const response = await model.meiliSearch(request.query, {
      filter: `user = ${quoteFilterValue(scope.userId)}`,
      limit: request.limit,
    });

    const hits: ChatSearchHit[] = [];
    for (const hit of response.hits ?? []) {
      const conversationId = asString(hit.conversationId);
      const recordId = request.target === 'messages' ? asString(hit.messageId) : conversationId;
      if (!recordId) {
        continue;
      }
      hits.push({ recordId, conversationId, score: 1, source: 'meilisearch' });
    }

    /**
     * No cursor: Meilisearch pagination was never wired through the previous
     * implementation either, and inventing one here would change how the routes
     * page for deployments that are supposed to be unaffected.
     */
    return { hits, nextCursor: null, degradations: [] };
  }
}
