import type { Scope } from '@librechat/data-schemas';
import type { Pool, PoolClient } from 'pg';

export type SearchTarget = 'messages' | 'conversations' | 'shared-links';

/** Row `kind` discriminator stored in `chat_search.documents`. */
export type SearchKind = 'message' | 'conversation' | 'shared-link';

export type SearchOp = 'upsert' | 'tombstone';

export type SortField = 'title' | 'createdAt' | 'updatedAt';

export type SortDirection = 'asc' | 'desc';

/**
 * The branded scope from `data-schemas`. Deliberately not a local structural
 * type: a second definition would be forgeable, and forgeability is the whole
 * thing the brand exists to prevent.
 */
export type SearchScope = Scope;

export type SearchFilters = {
  archived?: boolean;
  tags?: readonly string[];
  projectId?: string | 'unassigned';
  sort?: SortField;
  direction?: SortDirection;
};

export type ChatSearchRequest = Readonly<{
  target: SearchTarget;
  scope: SearchScope;
  query: string;
  limit: number;
  cursor?: string;
  filters?: SearchFilters;
}>;

/**
 * `embedding-unavailable` is "no query vector to search with";
 * `vector-unavailable` is "the query vector existed and the arm itself failed".
 * Distinct because they point at different systems.
 */
export type SearchDegradation =
  | 'embedding-unavailable'
  | 'vector-unavailable'
  | 'clickhouse-unavailable';

export type SearchSource = 'postgres' | 'clickhouse' | 'meilisearch';

export type ChatSearchHit = Readonly<{
  recordId: string;
  conversationId: string;
  score: number;
  source: SearchSource;
}>;

export type ChatSearchResult = {
  hits: readonly ChatSearchHit[];
  nextCursor: string | null;
  degradations: readonly SearchDegradation[];
};

export interface ChatSearch {
  search(request: ChatSearchRequest): Promise<ChatSearchResult>;
  isReady(): Promise<boolean>;
}

/**
 * Pre-response hit representation. `projectionVersion` never leaves the module;
 * it exists so fusion can arbitrate between a PostgreSQL row and a ClickHouse
 * row for the same key (higher version wins, PostgreSQL breaks ties).
 */
export type InternalHit = ChatSearchHit & {
  projectionVersion: number;
};

export type SearchRecordKey = Readonly<{
  tenantId: string;
  userId: string;
  kind: SearchKind;
  recordId: string;
}>;

/** Source-store projection of one record, as the projector reads it. */
export type ProjectionSource = SearchRecordKey & {
  conversationId: string | null;
  title: string;
  body: string;
  tags: readonly string[];
  isArchived: boolean;
  projectId: string | null;
  isTemporary: boolean;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  expiresAt: Date | null;
  unfinished: boolean;
};

export type ProjectionEvent = SearchRecordKey & {
  op: SearchOp;
  eventId: string;
};

export type EmbeddingWrite = SearchRecordKey & {
  space: string;
  embeddingInputHash: string;
  model: string;
  dimensions: number;
  normalized: boolean;
  formatterVersion: string;
  embedding: readonly number[];
};

export type SearchPool = Pool;
export type SearchClient = PoolClient;
