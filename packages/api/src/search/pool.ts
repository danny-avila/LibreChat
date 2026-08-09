import { Pool } from 'pg';
import { logger } from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
import type { SearchClient, SearchPool } from './types';
import { scopeGucStatement } from './scope';

export type PoolOptions = {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  applicationName?: string;
};

/**
 * A pool with no `error` listener is a process-level hazard, not a missing log
 * line: a server closing an idle connection makes pg re-emit that client's error
 * on the pool, and `EventEmitter` rethrows an `error` emission nobody listens for
 * as an uncaught exception — aborting whatever the pool happened to be serving.
 *
 * Nothing is swallowed by handling it here. pg only routes an error to the pool
 * once the client is back in the idle set; a failure on a checked-out client
 * rejects that client's own query, which is the promise a caller is awaiting.
 */
export function createSearchPool(options: PoolOptions): SearchPool {
  const statementTimeout = options.statementTimeoutMillis ?? 5_000;
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    application_name: options.applicationName ?? 'librechat-chat-search',
    statement_timeout: statementTimeout,
  });
  pool.on('error', (error: Error) => {
    logger.error('[chatSearch] idle pool client error', error);
  });
  return pool;
}

export async function withTransaction<T>(
  pool: SearchPool,
  fn: (client: SearchClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Applies scope transaction-locally so the RLS policies see it for the life of
 * the transaction and nothing leaks onto the pooled connection after release.
 * The `Scope` is branded, so an absent or unbranded value fails here rather than
 * reaching the server and silently returning zero rows.
 */
export async function applyScope(client: SearchClient, scope: Scope): Promise<void> {
  const statement = scopeGucStatement(scope);
  await client.query(statement.text, [...statement.values]);
}

export function withScope<T>(
  pool: SearchPool,
  scope: Scope,
  fn: (client: SearchClient) => Promise<T>,
): Promise<T> {
  return withTransaction(pool, async (client) => {
    await applyScope(client, scope);
    return fn(client);
  });
}
