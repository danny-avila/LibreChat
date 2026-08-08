import { Pool } from 'pg';
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
 * Applies scope transaction-locally so the RLS policies see it for the life of
 * the transaction and nothing leaks onto the pooled connection after release.
 * The `Scope` is branded and can only come from the shared factory, so an unset
 * or forged scope fails before any statement is sent rather than silently
 * returning zero rows.
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
