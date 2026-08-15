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

export const POISON_FAILURE_LIMIT = 5;

export const DRAIN_INTERVAL_MS = 2_000;
export const SAFETY_POLL_INTERVAL_MS = 60_000;
/** Fixed lookback overlap re-scanned by the safety poll with idempotent upserts. */
export const SAFETY_POLL_LOOKBACK_MS = 60_000;
export const SWEEP_INTERVAL_MS = 3_600_000;
/** Age past which the projector's reconciliation pass deletes outbox rows. */
export const OUTBOX_RETENTION_HOURS = 24;
export const LEASE_TTL_MS = 30_000;

/**
 * How long a pod that lost the election waits before trying again, and the
 * ceiling its backoff climbs to. A standby that stops trying is how a cluster
 * ends up with no projector at all once the leader dies.
 */
export const STANDBY_RETRY_MS = 5_000;
export const STANDBY_MAX_RETRY_MS = 60_000;

export const EMBEDDING_DIMENSIONS = 1024;
export const DEFAULT_EMBEDDING_SPACE = 'chat-v1';
export const FORMATTER_VERSION = 'v1';
