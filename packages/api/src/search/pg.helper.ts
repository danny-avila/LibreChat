import { Pool } from 'pg';
import type { SearchPool } from './types';
import { migrate } from './migrate';

/**
 * PostgreSQL-backed specs run against a real server addressed by
 * `CHAT_SEARCH_TEST_URL`. The URL must point at a role that can CREATE DATABASE
 * and CREATE ROLE.
 */
export const TEST_URL = process.env.CHAT_SEARCH_TEST_URL;

export type PgDescribe = jest.Describe;

/**
 * Skipping is a local convenience, never a CI outcome.
 *
 * On a developer machine with no container runtime these suites skip so the rest
 * of the package stays runnable. On a runner they must execute: an unconfigured
 * CI reported all of this as green while executing none of it, which is how a
 * component can be fully tested and still ship unreachable. Importing this
 * helper without a URL under CI therefore fails the suite outright rather than
 * quietly reclassifying it as skipped.
 */
function pgDescribe(): PgDescribe {
  if (TEST_URL) {
    return describe;
  }
  if (process.env.CI === 'true') {
    throw new Error(
      'CHAT_SEARCH_TEST_URL is unset in CI. The PostgreSQL-backed suites would skip and ' +
        'report green without executing; start the pgvector service for this job.',
    );
  }
  return describe.skip;
}

export const describePg: PgDescribe = pgDescribe();

function requireUrl(): string {
  if (!TEST_URL) {
    throw new Error('CHAT_SEARCH_TEST_URL is not set');
  }
  return TEST_URL;
}

function databaseUrl(database: string): string {
  const url = new URL(requireUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Each suite owns a database of its own. Suites otherwise race on
 * `DROP SCHEMA chat_search CASCADE`, which is silent when it wins and
 * bewildering when it loses.
 */
/**
 * `CREATE DATABASE` copies a template, and PostgreSQL refuses while another
 * session is connected to it. Jest runs suites in parallel, so the calls collide
 * unless they serialize — hence the advisory lock, held on the maintenance
 * connection for the whole drop-and-create.
 */
const SETUP_LOCK_ID = 0x63735f7467;

export async function createIsolatedDatabase(name: string): Promise<SearchPool> {
  const database = `chat_search_test_${name}`;
  const admin = new Pool({ connectionString: requireUrl(), max: 1 });
  try {
    await admin.query('SELECT pg_advisory_lock($1)', [SETUP_LOCK_ID]);
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
    await admin.query('SELECT pg_advisory_unlock($1)', [SETUP_LOCK_ID]);
  } finally {
    await admin.end();
  }
  return new Pool({ connectionString: databaseUrl(database), max: 8 });
}

export async function dropIsolatedDatabase(pool: SearchPool, name: string): Promise<void> {
  await pool.end().catch(() => undefined);
  const database = `chat_search_test_${name}`;
  const admin = new Pool({ connectionString: requireUrl(), max: 1 });
  try {
    await admin.query('SELECT pg_advisory_lock($1)', [SETUP_LOCK_ID]);
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    await admin.query('SELECT pg_advisory_unlock($1)', [SETUP_LOCK_ID]);
  } finally {
    await admin.end();
  }
}

export async function migrateFresh(name: string): Promise<SearchPool> {
  const pool = await createIsolatedDatabase(name);
  await migrate(pool);
  return pool;
}

export async function truncateAll(pool: SearchPool): Promise<void> {
  await pool.query(
    'TRUNCATE chat_search.documents, chat_search.outbox, chat_search.failures RESTART IDENTITY CASCADE',
  );
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`unsafe identifier: ${value}`);
  }
  return `"${value}"`;
}
