import { logger } from '@librechat/data-schemas';
import type { SearchClient, SearchPool } from './types';
import { LEASE_LOCK_CLASS, LEASE_NAME, LEASE_TTL_MS } from './constants';

/**
 * Leadership is a renewable PostgreSQL lease, not `FlowStateManager`.
 *
 * `FlowStateManager` is a non-atomic Keyv get/sleep/set with a fixed,
 * non-renewable TTL that falls back to running **unlocked** when the flows cache
 * is unavailable. That is boot-time deduplication, not a leader lock, and it
 * cannot hold a continuous 2s poll loop or an hour-long sweep.
 *
 * Two mechanisms, because one is not enough:
 *
 *  - A session-scoped `pg_advisory_lock` on a dedicated connection provides
 *    mutual exclusion and, crucially, releases automatically if the holder's
 *    process dies — no TTL to misjudge, no stuck lock to clear by hand.
 *  - An **epoch** fences writes. A holder that has been network-partitioned may
 *    not yet know it lost the lock; the advisory lock alone cannot stop its
 *    in-flight transaction from committing. Every projector write re-reads the
 *    epoch `FOR SHARE` in its own transaction, so a deposed holder's write
 *    either sees the new epoch and aborts, or commits before the new leader's
 *    bump can proceed. There is no window where both write.
 */
export type Lease = Readonly<{
  epoch: number;
  holder: string;
  renew(): Promise<boolean>;
  release(): Promise<void>;
}>;

export class LeaseLostError extends Error {
  constructor(expected: number, actual: number | null) {
    super(
      `[chatSearch] projector lease lost: expected epoch ${expected}, store holds ${actual ?? 'none'}`,
    );
    this.name = 'LeaseLostError';
  }
}

/** `hashtext` is stable within a major version, which is all a lock key needs. */
async function lockKey(client: SearchClient, name: string): Promise<number> {
  const { rows } = await client.query<{ key: number }>('SELECT hashtext($1) AS key', [name]);
  return rows[0].key;
}

/**
 * Attempts to become the projector. Returns null when another pod holds the
 * lease — the caller keeps serving, it simply does not project.
 */
export async function acquireLease(
  pool: SearchPool,
  holder: string,
  options: { ttlMs?: number; name?: string } = {},
): Promise<Lease | null> {
  const name = options.name ?? LEASE_NAME;
  const ttlMs = options.ttlMs ?? LEASE_TTL_MS;
  const client = await pool.connect();

  try {
    const key = await lockKey(client, name);
    const { rows: locked } = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      [LEASE_LOCK_CLASS, key],
    );
    if (!locked[0].acquired) {
      client.release();
      return null;
    }

    const { rows } = await client.query<{ epoch: string }>(
      `UPDATE chat_search.lease
          SET epoch = epoch + 1,
              holder = $1,
              renewed_at = now(),
              expires_at = now() + make_interval(secs => $2)
        WHERE name = $3
        RETURNING epoch`,
      [holder, ttlMs / 1000, name],
    );
    if (rows.length === 0) {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [LEASE_LOCK_CLASS, key]);
      client.release();
      throw new Error(`[chatSearch] lease row "${name}" is missing; run migrations`);
    }

    const epoch = Number(rows[0].epoch);
    let released = false;

    return Object.freeze({
      epoch,
      holder,
      async renew(): Promise<boolean> {
        if (released) {
          return false;
        }
        const result = await client.query(
          `UPDATE chat_search.lease
              SET renewed_at = now(),
                  expires_at = now() + make_interval(secs => $1)
            WHERE name = $2 AND epoch = $3`,
          [ttlMs / 1000, name, epoch],
        );
        return result.rowCount === 1;
      },
      async release(): Promise<void> {
        if (released) {
          return;
        }
        released = true;
        try {
          await client.query('SELECT pg_advisory_unlock($1, $2)', [LEASE_LOCK_CLASS, key]);
        } catch (error) {
          logger.warn('[chatSearch] failed to release the projector advisory lock', error);
        } finally {
          client.release();
        }
      },
    });
  } catch (error) {
    client.release();
    throw error;
  }
}

/**
 * Fences one transaction against a lease change.
 *
 * `FOR SHARE` is what makes this a fence rather than a check: a new leader's
 * epoch bump is an UPDATE on the same row, which conflicts with our share lock
 * and blocks until this transaction commits or aborts. A deposed holder can
 * therefore never interleave a write with the new leader's first write.
 */
export async function assertLeaseEpoch(client: SearchClient, epoch: number): Promise<void> {
  const { rows } = await client.query<{ epoch: string }>(
    'SELECT epoch FROM chat_search.lease WHERE name = $1 FOR SHARE',
    [LEASE_NAME],
  );
  const current = rows.length > 0 ? Number(rows[0].epoch) : null;
  if (current !== epoch) {
    throw new LeaseLostError(epoch, current);
  }
}
