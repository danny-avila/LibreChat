import fs from 'fs';
import path from 'path';
import { logger } from '@librechat/data-schemas';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'crypto';
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

/** PostgreSQL `insufficient_privilege`. */
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * Read before the tracking table is created, so the privilege preflight below can
 * run before this connection is asked to issue any DDL at all. An absent table
 * means nothing has been applied yet.
 *
 * A connection with no privilege to look is likewise told nothing has been
 * applied, which routes it into the preflight and a message naming the real
 * problem instead of a bare `permission denied for schema chat_search`.
 */
async function appliedChecksums(client: SearchClient): Promise<Map<string, string>> {
  const applied = new Map<string, string>();
  try {
    const { rows: present } = await client.query<{ present: boolean }>(
      "SELECT to_regclass('chat_search.migrations') IS NOT NULL AS present",
    );
    if (present[0]?.present !== true) {
      return applied;
    }
    const { rows } = await client.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM chat_search.migrations',
    );
    for (const row of rows) {
      applied.set(row.filename, row.checksum);
    }
  } catch (error) {
    if ((error as { code?: string }).code !== INSUFFICIENT_PRIVILEGE) {
      throw error;
    }
    applied.clear();
  }
  return applied;
}

/** The file that issues `CREATE ROLE`; the only one needing more than plain DDL. */
const ROLE_MIGRATION = '002_roles.sql';
/** The file that issues `CREATE EXTENSION`, which is superuser-only for these two. */
const SCHEMA_MIGRATION = '001_schema.sql';

export const MANAGED_ROLES: readonly string[] = Object.freeze([
  'chat_search_owner',
  'chat_search_writer',
  'chat_search_reader',
]);

/**
 * Neither is a trusted extension, so a non-superuser cannot install either one
 * however many grants it holds. Pre-installing them is the only way a
 * non-superuser bootstrap role can provision this schema.
 */
export const REQUIRED_EXTENSIONS: readonly string[] = Object.freeze(['pg_trgm', 'vector']);

/** Where an installed extension actually lives, which is not implied by its name. */
type ExtensionPlacement = {
  name: string;
  schema: string;
};

/**
 * Refuses a connection that cannot finish the run, before it starts one.
 *
 * Provisioning is privileged work and the privileges are not obvious, so each one
 * is named here rather than discovered halfway through a file:
 *
 *  - `002_roles.sql` creates the three application roles and then asserts
 *    `NOSUPERUSER NOBYPASSRLS` on each of them on every run. Only a superuser may
 *    set those attributes at all, in either direction.
 *  - It also cannot be applied *as* one of the roles it manages. Connected as
 *    `chat_search_owner`, the run strips its own role privileges partway through
 *    the file and every remaining `ALTER ROLE` fails, leaving the writer and
 *    reader created but unusable; on a fresh installation that role does not exist
 *    yet and the connection cannot even authenticate.
 *  - `001_schema.sql` creates `pg_trgm` and `vector`. Neither is a trusted
 *    extension, so a non-superuser cannot install either one however many grants
 *    it holds — the only alternative is a superuser installing them beforehand.
 *
 * So the provisioning connection is an existing administrative role, used for
 * nothing else. None of the three roles it creates is a superuser, and the
 * application never holds this connection.
 */
async function assertCanProvision(
  client: SearchClient,
  pending: readonly Migration[],
): Promise<void> {
  if (pending.length === 0) {
    return;
  }

  /**
   * Extensions are matched by name *and* schema: an installation this connection
   * does not search, or may not use, is not the same thing as one it can build
   * on, and `pg_extension` alone cannot tell them apart.
   */
  const { rows } = await client.query<{
    role: string;
    is_superuser: boolean;
    can_create_in_database: boolean;
    schema_exists: boolean;
    search_path: string[];
    missing_extensions: string[] | null;
    offpath_extensions: ExtensionPlacement[] | null;
    unusable_extensions: ExtensionPlacement[] | null;
    existing_managed_roles: string[] | null;
  }>(
    `WITH required AS (
       SELECT e.extname::text AS name, n.nspname::text AS schema,
              n.nspname = ANY (current_schemas(true)) AS searched,
              has_schema_privilege(n.nspname, 'USAGE') AS usable
         FROM pg_extension e
         JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = ANY($1::text[])
     )
     SELECT current_user AS role,
            rolsuper AS is_superuser,
            has_database_privilege(current_database(), 'CREATE') AS can_create_in_database,
            to_regnamespace('chat_search') IS NOT NULL AS schema_exists,
            current_schemas(true)::text[] AS search_path,
            ARRAY(SELECT unnest($1::text[])
                   EXCEPT SELECT name FROM required) AS missing_extensions,
            (SELECT json_agg(json_build_object('name', name, 'schema', schema) ORDER BY name)
               FROM required WHERE NOT searched) AS offpath_extensions,
            (SELECT json_agg(json_build_object('name', name, 'schema', schema) ORDER BY name)
               FROM required WHERE NOT searched AND NOT usable) AS unusable_extensions,
            ARRAY(SELECT rolname::text FROM pg_roles
                   WHERE rolname = ANY($2::text[])) AS existing_managed_roles
       FROM pg_roles WHERE rolname = current_user`,
    [[...REQUIRED_EXTENSIONS], [...MANAGED_ROLES]],
  );
  const state = rows[0];
  if (!state) {
    return;
  }
  const rolesPending = pending.some((migration) => migration.filename === ROLE_MIGRATION);
  const schemaPending = pending.some((migration) => migration.filename === SCHEMA_MIGRATION);

  /**
   * Diagnosed first because it is the mistake with the least obvious cause: a
   * managed role also fails the checks below, and "you are not a superuser" sends
   * an operator looking for a grant that would not have helped.
   */
  if (rolesPending && MANAGED_ROLES.includes(state.role)) {
    throw new Error(
      `[chatSearch] ${ROLE_MIGRATION} creates and then restricts ${state.role}, so it cannot be ` +
        'applied by that role. Point CHAT_SEARCH_MIGRATE_URL at an existing administrative role ' +
        '(whatever the cluster was initialised with).',
    );
  }
  if (rolesPending && !state.is_superuser) {
    throw new Error(
      `[chatSearch] ${ROLE_MIGRATION} asserts NOSUPERUSER and NOBYPASSRLS on all three roles, ` +
        `which only a superuser may do; role ${state.role} is not one. Point ` +
        'CHAT_SEARCH_MIGRATE_URL at an administrative connection — it is used for provisioning ' +
        'only, and none of the roles it creates is privileged.',
    );
  }

  const missing = state.missing_extensions ?? [];
  if (schemaPending && !state.is_superuser && missing.length > 0) {
    throw new Error(
      `[chatSearch] ${missing.join(' and ')} must exist before ${SCHEMA_MIGRATION} can run, and ` +
        `neither is a trusted extension, so ${state.role} cannot create them. Either provision ` +
        'with a superuser connection, or have one run ' +
        `${missing.map((name) => `CREATE EXTENSION ${name}`).join('; ')} in this database first.`,
    );
  }

  const unusable = state.unusable_extensions ?? [];
  if (schemaPending && unusable.length > 0) {
    const placements = unusable.map((ext) => `${ext.name} (schema ${ext.schema})`).join(' and ');
    const verb = unusable.length === 1 ? 'is' : 'are';
    throw new Error(
      `[chatSearch] ${placements} ${verb} installed in a schema role ${state.role} may not use, ` +
        `so ${SCHEMA_MIGRATION} cannot resolve the types and operator classes involved and ` +
        'CREATE EXTENSION IF NOT EXISTS will not install a second copy. Grant USAGE on that ' +
        'schema, or reinstall the extension into one this connection can reach.',
    );
  }

  if (!state.schema_exists && !state.can_create_in_database) {
    throw new Error(
      `[chatSearch] role ${state.role} cannot CREATE in this database, so the chat_search schema ` +
        'cannot be created; point CHAT_SEARCH_MIGRATE_URL at a role that can',
    );
  }

  warnOnUnsearchedExtensions(schemaPending, state.offpath_extensions ?? [], state.search_path);
  warnOnForeignManagedRoles(rolesPending, state.existing_managed_roles ?? []);
}

/**
 * An extension is only half-found by name. `CREATE EXTENSION IF NOT EXISTS` is
 * satisfied by the name alone and will not install a second copy, while the
 * types and operator classes it owns resolve through `search_path` and nothing
 * else — USAGE on the schema is necessary and not sufficient. `001_schema.sql`
 * puts the extension schemas on the path for its own run, so provisioning
 * succeeds; the application roles get no such help and their queries cast to
 * `vector` and order by `<=>`, so the placement is named here while an operator
 * is still watching.
 */
function warnOnUnsearchedExtensions(
  schemaPending: boolean,
  offPath: readonly ExtensionPlacement[],
  searchPath: readonly string[],
): void {
  if (!schemaPending || offPath.length === 0) {
    return;
  }
  const placements = offPath.map((ext) => `${ext.name} (schema ${ext.schema})`).join(' and ');
  logger.warn(
    `[chatSearch] ${placements} ${offPath.length === 1 ? 'is' : 'are'} installed outside the ` +
      `search_path of this connection (${searchPath.join(', ')}). ${SCHEMA_MIGRATION} resolves ` +
      'them for its own run, but the application roles do not inherit that: give ' +
      `${MANAGED_ROLES.join(', ')} a search_path covering that schema ` +
      '(ALTER ROLE <role> IN DATABASE <database> SET search_path = ...), or reinstall the ' +
      'extension into a schema they already search.',
  );
}

/**
 * Role names are cluster-global while every grant these migrations issue is
 * per-database, so two deployments sharing one cluster do not get one set of
 * roles each: the second provisioning run rotates the first's credentials, and
 * the credential that survives can read both databases. Roles that already exist
 * before this database has ever applied the role migration are the one visible
 * sign of that, so the run says so rather than silently taking them over.
 */
function warnOnForeignManagedRoles(rolesPending: boolean, existing: readonly string[]): void {
  if (!rolesPending || existing.length === 0) {
    return;
  }
  logger.warn(
    `[chatSearch] ${existing.join(', ')} already exist on this server, but ${ROLE_MIGRATION} has ` +
      'never been applied to this database. Role names are fixed and cluster-global: if another ' +
      'deployment or an earlier installation owns these roles, provisioning here rotates its ' +
      'credentials and leaves one credential able to read both databases. Give each deployment ' +
      'its own PostgreSQL server.',
  );
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
    const known = await appliedChecksums(client);

    /** Before the tracking table, so a connection that cannot provision issues no DDL. */
    await assertCanProvision(
      client,
      migrations.filter((migration) => known.get(migration.filename) !== migration.checksum),
    );
    await client.query(TRACKING_TABLE);

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

/** PostgreSQL's own default. Every login pays this cost, so it is not raised idly. */
const SCRAM_ITERATIONS = 4096;
const SCRAM_SALT_BYTES = 16;
const SHA256_BYTES = 32;

/**
 * Derives the SCRAM-SHA-256 verifier PostgreSQL stores for a role.
 *
 * `ALTER ROLE` is DDL, so a server running with `log_statement = 'ddl'` or
 * `'all'` — the audit preset offered by several managed providers — writes the
 * statement text to its log, and the default `log_min_error_statement` puts the
 * same text on the `STATEMENT:` line of any failure. A password sent as a
 * literal is therefore in the log before this process can catch anything.
 * Sending a verifier removes that entirely: the server recognises this shape and
 * stores it verbatim instead of deriving one, which is what `psql \password`
 * does for the same reason.
 *
 * The password bytes are hashed as supplied, matching the SCRAM client in `pg`
 * that every consumer here authenticates with. A password that SASLprep would
 * rewrite — non-ASCII whitespace, an unnormalised composition — hashes
 * differently under libpq and would not authenticate from `psql`.
 */
export function scramSha256Verifier(password: string): string {
  const salt = randomBytes(SCRAM_SALT_BYTES);
  const saltedPassword = pbkdf2Sync(password, salt, SCRAM_ITERATIONS, SHA256_BYTES, 'sha256');
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest();
  return (
    `SCRAM-SHA-256$${SCRAM_ITERATIONS}:${salt.toString('base64')}` +
    `$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
  );
}

/**
 * Sets role passwords from the environment.
 *
 * Passwords are operator-supplied and never appear in the SQL files, in a
 * default, or in a log line. The cleartext never leaves this process either:
 * what is sent is the SCRAM verifier derived above, so neither the statement nor
 * its parameters carry anything the server could log. Quoting is still delegated
 * to the server's own `format()`, and a failing `ALTER ROLE` is re-thrown naming
 * only the role.
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
        ['ALTER ROLE %I WITH LOGIN PASSWORD %L', role, scramSha256Verifier(password)],
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
