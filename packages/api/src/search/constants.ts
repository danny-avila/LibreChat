import type { SearchKind, SearchTarget } from './types';

export const SEARCH_SCHEMA = 'chat_search';

/** Transaction-local GUCs the RLS policies read. */
export const TENANT_GUC = 'chat_search.tenant_id';
export const USER_GUC = 'chat_search.user_id';

/**
 * Namespaced advisory-lock classes. The lease is session-scoped on a dedicated
 * connection; per-record locks are transaction-scoped around every
 * read-source-then-upsert.
 */
export const LEASE_LOCK_CLASS = 0x63735f6c;
export const RECORD_LOCK_CLASS = 0x63735f72;

export const LEASE_NAME = 'projector';

export const CURSOR_VERSION = 1;

/** Reciprocal-rank-fusion tuning. */
export const RRF_K = 60;
export const ARM_LIMIT = 50;
export const CANDIDATE_CAP = 200;

/** The vector arm does not engage below this normalized query length. */
export const MIN_QUERY_LENGTH = 3;

export const POISON_FAILURE_LIMIT = 5;

export const DRAIN_INTERVAL_MS = 2_000;
export const SAFETY_POLL_INTERVAL_MS = 60_000;
/** Fixed lookback overlap re-scanned by the safety poll with idempotent upserts. */
export const SAFETY_POLL_LOOKBACK_MS = 60_000;
export const SWEEP_INTERVAL_MS = 3_600_000;
export const LEASE_TTL_MS = 30_000;
export const LEASE_RENEW_MS = 10_000;

export const EMBEDDING_DIMENSIONS = 1024;
export const DEFAULT_EMBEDDING_SPACE = 'chat-v1';
export const FORMATTER_VERSION = 'v1';

export const TARGET_KIND: Readonly<Record<SearchTarget, SearchKind>> = Object.freeze({
  messages: 'message',
  conversations: 'conversation',
  'shared-links': 'shared-link',
});

export const KIND_TARGET: Readonly<Record<SearchKind, SearchTarget>> = Object.freeze({
  message: 'messages',
  conversation: 'conversations',
  'shared-link': 'shared-links',
});
