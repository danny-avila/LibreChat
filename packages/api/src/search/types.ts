import type { Pool, PoolClient } from 'pg';

/** Row `kind` discriminator stored in `chat_search.documents`. */
export type SearchKind = 'message' | 'conversation' | 'shared-link';

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
