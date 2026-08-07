import { Pool } from 'pg';
import type { SearchClient, SearchPool, SearchScope } from './types';
import { TENANT_GUC, USER_GUC } from './constants';

export type PoolOptions = {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  applicationName?: string;
};

export function createSearchPool(options: PoolOptions): SearchPool {
  const statementTimeout = options.statementTimeoutMillis ?? 5_000;
  return new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    application_name: options.applicationName ?? 'librechat-chat-search',
    statement_timeout: statementTimeout,
  });
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
 * Applies tenant and user scope transaction-locally, so the RLS policies see it
 * for the life of the transaction and nothing leaks onto the pooled connection
 * after release. Empty scope is rejected here as well as at resolution time: an
 * unset GUC would make every policy predicate false, but an accidental empty
 * string is worth failing loudly rather than silently returning zero rows.
 */
export async function applyScope(client: SearchClient, scope: SearchScope): Promise<void> {
  if (!scope.tenantId || !scope.userId) {
    throw new Error('[chatSearch] refusing to apply empty search scope');
  }
  await client.query('SELECT set_config($1, $2, true), set_config($3, $4, true)', [
    TENANT_GUC,
    scope.tenantId,
    USER_GUC,
    scope.userId,
  ]);
}

export function withScope<T>(
  pool: SearchPool,
  scope: SearchScope,
  fn: (client: SearchClient) => Promise<T>,
): Promise<T> {
  return withTransaction(pool, async (client) => {
    await applyScope(client, scope);
    return fn(client);
  });
}
