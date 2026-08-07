import { logger } from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
import type {
  ChatSearch,
  ChatSearchHit,
  ChatSearchRequest,
  ChatSearchResult,
  InternalHit,
  SearchDegradation,
  SearchFilters,
  SearchPool,
  SearchTarget,
} from './types';
import type { SnapshotCursor, SnapshotStore } from './cursor';
import type { ArmResult } from './fusion';
import {
  acceptSnapshot,
  createMemorySnapshotStore,
  decodeCursor,
  encodeCursor,
  hashQuery,
  newSnapshotId,
  requireCursorSecret,
} from './cursor';
import {
  ARM_LIMIT,
  CANDIDATE_CAP,
  CURSOR_VERSION,
  DEFAULT_EMBEDDING_SPACE,
  MIN_QUERY_LENGTH,
  TARGET_KIND,
} from './constants';
import { runLexicalArms, runVectorArmOrNull, shouldRunVectorArm } from './arms';
import { normalizeSearchText } from './hash';
import { scopedQuery } from './scope';
import { fuseByRrf } from './fusion';
import { withScope } from './pool';

const SNAPSHOT_TTL_MS = 600_000;

/**
 * Produces a query embedding. Supplied by the caller so this module has no
 * opinion about which service does it, and so a deployment without one degrades
 * to lexical-only rather than failing.
 */
export interface QueryEmbedder {
  embed(query: string): Promise<readonly number[] | null>;
}

export type ChatSearchDeps = Readonly<{
  pool: SearchPool;
  resolveScope: () => Scope;
  embedder?: QueryEmbedder;
  snapshots?: SnapshotStore;
  space?: string;
  cursorSecret?: string;
}>;

/**
 * PostgreSQL-backed chat search.
 *
 * Returns candidate IDs and scores only — stored search text never merges into a
 * response, and the caller hydrates and authorizes every hit against the primary
 * store.
 *
 * Scope is re-derived from the request context on every call, including every
 * page of a paginated search. Nothing about scope is ever read from the query,
 * the body, or the cursor.
 */
export class PostgresChatSearch implements ChatSearch {
  private readonly deps: ChatSearchDeps;
  private readonly snapshots: SnapshotStore;
  private readonly space: string;
  private readonly cursorSecret: string;

  constructor(deps: ChatSearchDeps) {
    this.deps = deps;
    this.snapshots = deps.snapshots ?? createMemorySnapshotStore();
    this.space = deps.space ?? process.env.CHAT_SEARCH_EMBEDDING_SPACE ?? DEFAULT_EMBEDDING_SPACE;
    /** Fails at construction, not at the first paginated request. */
    this.cursorSecret = deps.cursorSecret ?? requireCursorSecret();
  }

  async isReady(): Promise<boolean> {
    try {
      await this.deps.pool.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('[chatSearch] readiness probe failed', error);
      return false;
    }
  }

  /**
   * Runs every arm and fuses them.
   *
   * The lexical arms serve unconditionally. The vector arm is additive: a query
   * shorter than the minimum, an absent embedder, or an embedding failure
   * degrades the result rather than emptying it, and the degradation is reported
   * rather than hidden.
   */
  private async collect(
    scope: Scope,
    target: SearchTarget,
    query: string,
    filters: SearchFilters | undefined,
  ): Promise<{ hits: readonly InternalHit[]; degradations: SearchDegradation[] }> {
    const degradations: SearchDegradation[] = [];
    const kind = TARGET_KIND[target];

    /**
     * Embedding happens only for a scope that has already been resolved, and the
     * text embedded is the user's own query — never candidate content. Candidate
     * text is authorized before it could reach any external service, because it
     * never leaves this process at all on this path.
     */
    let embedding: readonly number[] | null = null;
    if (this.deps.embedder && shouldRunVectorArm(query)) {
      try {
        embedding = await this.deps.embedder.embed(query);
      } catch (error) {
        logger.warn('[chatSearch] query embedding failed; serving lexical arms only', error);
      }
      if (!embedding) {
        degradations.push('embedding-unavailable');
      }
    } else if (this.deps.embedder) {
      degradations.push('embedding-unavailable');
    }

    const { hits, vectorFailed } = await withScope(this.deps.pool, scope, async (client) => {
      /** One instant for every arm in this request. */
      const now = new Date();
      const scoped = scopedQuery(scope, kind, { now, filters });

      const lexical = await runLexicalArms(client, scoped, query, ARM_LIMIT);
      const arms: ArmResult[] = [
        { name: 'exact', source: 'postgres', candidates: lexical.exact },
        { name: 'trigram', source: 'postgres', candidates: lexical.trigram },
        { name: 'fts', source: 'postgres', candidates: lexical.fts },
      ];

      /**
       * A vector arm that fails is a degradation, not an outage: the lexical
       * results in hand at this point are already serviceable, and discarding
       * them would make the vector arm load-bearing for a response it is only
       * ever supposed to improve.
       */
      let failed = false;
      if (embedding) {
        const vector = await runVectorArmOrNull(client, scoped, embedding, this.space, ARM_LIMIT);
        if (vector) {
          arms.push({ name: 'vector', source: 'postgres', candidates: vector });
        } else {
          failed = true;
        }
      }

      return { hits: fuseByRrf(arms, { cap: CANDIDATE_CAP }), vectorFailed: failed };
    });

    if (vectorFailed) {
      degradations.push('vector-unavailable');
    }

    return { hits, degradations };
  }

  private toPublic(hits: readonly InternalHit[]): readonly ChatSearchHit[] {
    return hits.map(({ recordId, conversationId, score, source }) => ({
      recordId,
      conversationId,
      score,
      source,
    }));
  }

  async search(request: ChatSearchRequest): Promise<ChatSearchResult> {
    /**
     * Re-derived every call. The `scope` on the request is advisory only — an
     * adapter may pass it for readability, but it is never trusted.
     */
    const scope = this.deps.resolveScope();
    const query = normalizeSearchText(request.query);
    const limit = Math.max(1, Math.min(request.limit, ARM_LIMIT));

    if (query.length < MIN_QUERY_LENGTH) {
      return { hits: [], nextCursor: null, degradations: [] };
    }

    const queryHash = hashQuery(query, request.target, request.filters);
    const decoded = decodeCursor<SnapshotCursor>(request.cursor, this.cursorSecret);
    if (decoded.status === 'restart') {
      logger.info(`[chatSearch] restarting pagination: ${decoded.reason}`);
    }

    if (decoded.status === 'ok') {
      const page = await this.pageFromSnapshot(scope, request, decoded.payload, queryHash, limit);
      if (page) {
        return page;
      }
      /**
       * Cache miss, expired TTL, or a snapshot belonging to another principal or
       * another query. Re-running is correct and never errors: the caller gets a
       * fresh, correctly-scoped snapshot instead of a 400.
       */
    }

    const { hits, degradations } = await this.collect(
      scope,
      request.target,
      query,
      request.filters,
    );
    const snapshotId = newSnapshotId();
    await this.snapshots.set(
      snapshotId,
      {
        tenantId: scope.tenantId,
        userId: scope.userId,
        target: request.target,
        queryHash,
        recordIds: hits.map((hit) => hit.recordId),
        createdAt: Date.now(),
      },
      SNAPSHOT_TTL_MS,
    );

    const page = hits.slice(0, limit);
    return {
      hits: this.toPublic(page),
      nextCursor:
        hits.length > limit
          ? encodeCursor(
              { v: CURSOR_VERSION, snapshotId, offset: limit, queryHash },
              this.cursorSecret,
            )
          : null,
      degradations,
    };
  }

  /**
   * Serves one page from a frozen candidate list.
   *
   * Re-running the arms per page would re-rank between pages; the snapshot is
   * what makes ordering stable. Returns null when the snapshot cannot be used,
   * so the caller re-runs rather than failing.
   */
  private async pageFromSnapshot(
    scope: Scope,
    request: ChatSearchRequest,
    cursor: SnapshotCursor,
    queryHash: string,
    limit: number,
  ): Promise<ChatSearchResult | null> {
    const stored = await this.snapshots.get(cursor.snapshotId);
    const accepted = acceptSnapshot(stored, scope, queryHash);
    if (!accepted.ok) {
      return null;
    }
    if (accepted.snapshot.target !== request.target) {
      return null;
    }

    const offset = Math.max(0, Math.floor(cursor.offset));
    const slice = accepted.snapshot.recordIds.slice(offset, offset + limit);
    if (slice.length === 0) {
      return { hits: [], nextCursor: null, degradations: [] };
    }

    /**
     * The snapshot holds ids, not rows. Re-reading through the scoped query on
     * every page is what keeps a record deleted, expired or made temporary since
     * page one from being served — the reject list is applied per page, not once.
     */
    const rows = await this.readSnapshotSlice(scope, request.target, slice, request.filters);
    const exhausted = offset + limit >= accepted.snapshot.recordIds.length;

    return {
      hits: rows,
      nextCursor: exhausted
        ? null
        : encodeCursor(
            {
              v: CURSOR_VERSION,
              snapshotId: cursor.snapshotId,
              offset: offset + limit,
              queryHash,
            },
            this.cursorSecret,
          ),
      degradations: [],
    };
  }

  private readSnapshotSlice(
    scope: Scope,
    target: SearchTarget,
    recordIds: readonly string[],
    filters: SearchFilters | undefined,
  ): Promise<readonly ChatSearchHit[]> {
    const kind = TARGET_KIND[target];
    return withScope(this.deps.pool, scope, async (client) => {
      const scoped = scopedQuery(scope, kind, { filters });
      const idIndex = scoped.nextIndex;
      const { rows } = await client.query<{
        record_id: string;
        conversation_id: string | null;
        position: string;
      }>(
        `SELECT d.record_id, d.conversation_id, ordering.position
           FROM chat_search.documents d
           JOIN unnest($${idIndex}::text[]) WITH ORDINALITY AS ordering(record_id, position)
             ON ordering.record_id = d.record_id
          WHERE ${scoped.text}
          ORDER BY ordering.position`,
        [...scoped.values, [...recordIds]],
      );

      return rows.map((row) => ({
        recordId: row.record_id,
        conversationId: row.conversation_id ?? '',
        /** Rank position within the frozen list; the fused score is not re-derived. */
        score: 1 / (1 + Number(row.position)),
        source: 'postgres' as const,
      }));
    });
  }
}
