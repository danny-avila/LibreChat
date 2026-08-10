import { logger } from '@librechat/data-schemas';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { Scope } from '@librechat/data-schemas';
import type { SearchTarget, SortDirection, SortField } from './types';
import { CURSOR_VERSION } from './constants';

/**
 * Cursors are opaque, versioned and HMAC-signed. They never carry tenant or user
 * scope — that is re-derived from the request context on every page — and never
 * carry watermark or arm state.
 *
 * One shape, `{v, snapshotId, offset, queryHash}`, because fused rank positions
 * are not stable keys: projections re-rank both arms between pages, so live
 * keyset pagination over RRF cannot produce gap-free pages at any depth.
 * Freezing the candidate list once and paging within it is what buys stable
 * ordering. The conversation and shared-link listings never mint a cursor here
 * at all — they resolve one candidate window and page it in the primary store,
 * which owns the sort.
 *
 * The snapshot id alone is not an authorization token: the snapshot records the
 * scope that created it, and a page request whose re-derived scope differs is
 * rejected even with a perfectly valid signature.
 */
export type SnapshotCursor = Readonly<{
  v: number;
  snapshotId: string;
  offset: number;
  queryHash: string;
}>;

export type DecodedCursor<T extends SnapshotCursor> =
  | { status: 'ok'; payload: T }
  | { status: 'absent' }
  /**
   * Legacy grace: an unversioned or malformed cursor behaves as page one rather
   * than 400ing, so cursors already in flight from the previous implementation
   * do not break mid-session.
   */
  | { status: 'restart'; reason: string };

export class CursorConfigurationError extends Error {
  constructor() {
    super(
      '[chatSearch] CHAT_SEARCH_CURSOR_SECRET is required to sign cursors ' +
        '(operator-supplied, no default)',
    );
    this.name = 'CursorConfigurationError';
  }
}

/**
 * Signing key is operator-supplied and required. A fallback default would make
 * every deployment that forgot to set one share a forgeable key, which is worse
 * than refusing to start.
 */
export function requireCursorSecret(): string {
  const secret = process.env.CHAT_SEARCH_CURSOR_SECRET;
  if (!secret) {
    throw new CursorConfigurationError();
  }
  return secret;
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function encodeCursor(payload: SnapshotCursor, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

export function decodeCursor<T extends SnapshotCursor>(
  token: string | undefined,
  secret: string,
): DecodedCursor<T> {
  if (!token) {
    return { status: 'absent' };
  }

  const separator = token.lastIndexOf('.');
  if (separator <= 0) {
    return { status: 'restart', reason: 'unsigned or legacy cursor' };
  }

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, sign(secret, body))) {
    /**
     * A tampered signature is never served: it restarts at page one rather than
     * being honoured. Combined with scope re-derivation, a forged cursor cannot
     * shift what a caller can see — only where their own results start.
     */
    return { status: 'restart', reason: 'cursor signature mismatch' };
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (payload?.v !== CURSOR_VERSION) {
      return { status: 'restart', reason: `unsupported cursor version ${String(payload?.v)}` };
    }
    return { status: 'ok', payload };
  } catch {
    return { status: 'restart', reason: 'malformed cursor payload' };
  }
}

/** Normalized so the same search re-issued produces the same snapshot key. */
export function hashQuery(
  query: string,
  target: SearchTarget,
  filters: Readonly<{ sort?: SortField; direction?: SortDirection }> = {},
): string {
  return createHash('sha256')
    .update(`${target}${query}${filters.sort ?? ''}${filters.direction ?? ''}`)
    .digest('base64url');
}

export type Snapshot = Readonly<{
  tenantId: string;
  userId: string;
  target: SearchTarget;
  queryHash: string;
  recordIds: readonly string[];
  createdAt: number;
}>;

export interface SnapshotStore {
  get(snapshotId: string): Promise<Snapshot | null>;
  set(snapshotId: string, snapshot: Snapshot, ttlMs: number): Promise<void>;
}

/**
 * How many live snapshots one process keeps. At the 200-candidate cap each entry
 * is a few kilobytes, so this is a bounded ceiling rather than a tuning knob.
 */
export const SNAPSHOT_STORE_CAPACITY = 1_000;

/**
 * Process-local snapshot store, bounded.
 *
 * Adequate for a single pod; a multi-pod deployment supplies a shared
 * (Redis-backed) implementation instead. A miss is never an error — the search
 * re-runs and re-snapshots — so the degraded behaviour of this default under
 * multiple pods is a slightly shifted page, not a failure, and that is also what
 * makes evicting under pressure safe.
 *
 * The bound is a real one. Sweeping expired entries alone bounds nothing: a burst
 * of searches inside one TTL window is entirely *live*, so nothing is eligible and
 * the map grows for as long as the traffic lasts. Once the sweep frees nothing,
 * the oldest entries go — `Map` preserves insertion order, so its own iteration
 * order is the eviction order, and the oldest snapshot is the one whose reader has
 * most likely stopped paging.
 */
export function createMemorySnapshotStore(
  capacity: number = SNAPSHOT_STORE_CAPACITY,
): SnapshotStore {
  const entries = new Map<string, { snapshot: Snapshot; expiresAt: number }>();

  const evict = (): void => {
    const now = Date.now();
    for (const [key, value] of entries) {
      if (value.expiresAt <= now) {
        entries.delete(key);
      }
    }
    for (const key of entries.keys()) {
      if (entries.size <= capacity) {
        return;
      }
      entries.delete(key);
    }
  };

  return {
    async get(snapshotId) {
      const entry = entries.get(snapshotId);
      if (!entry) {
        return null;
      }
      if (entry.expiresAt <= Date.now()) {
        entries.delete(snapshotId);
        return null;
      }
      return entry.snapshot;
    },
    async set(snapshotId, snapshot, ttlMs) {
      entries.set(snapshotId, { snapshot, expiresAt: Date.now() + ttlMs });
      if (entries.size > capacity) {
        evict();
      }
    },
  };
}

export function newSnapshotId(): string {
  return randomUUID();
}

export type SnapshotRejection = 'scope-mismatch' | 'query-mismatch' | 'missing';

/**
 * Binds a snapshot to the scope that created it.
 *
 * A cursor minted under one user must not read another user's snapshot even
 * with a valid signature, so the check is on the re-derived request scope rather
 * than on anything the cursor carries.
 */
export function acceptSnapshot(
  snapshot: Snapshot | null,
  scope: Scope,
  queryHash: string,
): { ok: true; snapshot: Snapshot } | { ok: false; reason: SnapshotRejection } {
  if (!snapshot) {
    return { ok: false, reason: 'missing' };
  }
  if (snapshot.tenantId !== scope.tenantId || snapshot.userId !== scope.userId) {
    logger.warn('[chatSearch] rejected a cursor whose snapshot belongs to another principal');
    return { ok: false, reason: 'scope-mismatch' };
  }
  if (snapshot.queryHash !== queryHash) {
    return { ok: false, reason: 'query-mismatch' };
  }
  return { ok: true, snapshot };
}
