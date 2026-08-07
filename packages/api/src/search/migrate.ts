import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { SearchClient, SearchPool } from './types';
import { withTransaction } from './pool';

/** Serializes concurrent migration runners across pods. */
const MIGRATION_LOCK_ID = 0x63735f6d6967;

const TRACKING_TABLE = `
  CREATE SCHEMA IF NOT EXISTS chat_search;
  CREATE TABLE IF NOT EXISTS chat_search.migrations (
    filename    text        PRIMARY KEY,
    checksum    text        NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
  );
`;

export type Migration = {
  filename: string;
  checksum: string;
  sql: string;
};

export function migrationsDir(): string {
  return process.env.CHAT_SEARCH_MIGRATIONS_DIR ?? path.join(__dirname, 'migrations');
}

export function readMigrations(dir: string = migrationsDir()): Migration[] {
  return fs
    .readdirSync(dir)
    .filter((filename) => filename.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
      return { filename, checksum: createHash('sha256').update(sql).digest('hex'), sql };
    });
}

async function appliedChecksums(client: SearchClient): Promise<Map<string, string>> {
  const { rows } = await client.query<{ filename: string; checksum: string }>(
    'SELECT filename, checksum FROM chat_search.migrations',
  );
  const applied = new Map<string, string>();
  for (const row of rows) {
    applied.set(row.filename, row.checksum);
  }
  return applied;
}

/**
 * Applies every pending migration in lexical order, each in its own transaction,
 * under a session advisory lock so concurrent runners serialize instead of
 * racing. Files are idempotent, so a partially-applied run is safe to re-run;
 * a checksum change on an already-applied file is drift and fails loudly.
 */
export async function migrate(pool: SearchPool): Promise<readonly string[]> {
  const migrations = readMigrations();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(TRACKING_TABLE);
    const known = await appliedChecksums(client);

    for (const migration of migrations) {
      const previous = known.get(migration.filename);
      if (previous === migration.checksum) {
        continue;
      }
      if (previous != null) {
        throw new Error(
          `[chatSearch] migration ${migration.filename} changed after it was applied ` +
            '(checksum drift); add a new migration instead of editing an applied one',
        );
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO chat_search.migrations (filename, checksum) VALUES ($1, $2)',
          [migration.filename, migration.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
      applied.push(migration.filename);
      logger.info(`[chatSearch] applied migration ${migration.filename}`);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

const ROLE_PASSWORD_ENV: Readonly<Record<string, string>> = Object.freeze({
  chat_search_owner: 'CHAT_SEARCH_OWNER_PASSWORD',
  chat_search_writer: 'CHAT_SEARCH_WRITER_PASSWORD',
  chat_search_reader: 'CHAT_SEARCH_READER_PASSWORD',
});

/**
 * Sets role passwords from the environment.
 *
 * Passwords are operator-supplied and never appear in the SQL files, in a
 * default, or in a log line. Quoting is delegated to the server's own
 * `format()` so nothing has to be escaped by hand — and the rendered statement,
 * which contains the literal, is never logged and never allowed into an error
 * message: a failing `ALTER ROLE` is re-thrown naming only the role.
 */
export async function applyRolePasswords(pool: SearchPool): Promise<readonly string[]> {
  const updated: string[] = [];
  await withTransaction(pool, async (client) => {
    for (const [role, envKey] of Object.entries(ROLE_PASSWORD_ENV)) {
      const password = process.env[envKey];
      if (!password) {
        continue;
      }
      const { rows } = await client.query<{ statement: string }>(
        'SELECT format($1, $2::text, $3::text) AS statement',
        ['ALTER ROLE %I WITH LOGIN PASSWORD %L', role, password],
      );
      try {
        await client.query(rows[0].statement);
      } catch {
        throw new Error(`[chatSearch] failed to set the password for role ${role}`);
      }
      updated.push(role);
    }
  });
  return updated;
}

/**
 * Roles whose password must be operator-supplied before the stack is allowed to
 * serve. There is deliberately no fallback: a working default is how the
 * adjacent `vectordb` ended up reachable with a credential committed to four
 * compose files and a Helm chart.
 */
export function assertRoleCredentialsConfigured(): void {
  const missing = Object.values(ROLE_PASSWORD_ENV).filter((envKey) => !process.env[envKey]);
  if (missing.length > 0) {
    throw new Error(
      `[chatSearch] missing required role credentials: ${missing.join(', ')} ` +
        '(operator-supplied, no defaults)',
    );
  }
}
