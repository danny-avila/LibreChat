import type { Pool, PoolClient } from 'pg';

/** Row `kind` discriminator stored in `chat_search.documents`. */
export type SearchKind = 'message' | 'conversation' | 'shared-link';

export type SearchPool = Pool;
export type SearchClient = PoolClient;
