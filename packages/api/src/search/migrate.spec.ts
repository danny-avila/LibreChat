import { Pool } from 'pg';
import { logger } from '@librechat/data-schemas';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'crypto';
import type { PoolClient } from 'pg';
import type { SearchPool } from './types';
import {
  applyRolePasswords,
  assertRoleCredentialsConfigured,
  MANAGED_ROLES,
  migrate,
  readMigrations,
  REQUIRED_EXTENSIONS,
  scramSha256Verifier,
} from './migrate';
import {
  createIsolatedDatabase,
  describePg,
  dropIsolatedDatabase,
  isolatedDatabaseUrl,
  migrateFresh,
  roleDatabaseUrl,
  TEST_URL,
} from './pg.helper';
import { findRoleViolations, READER_ROLE, WRITER_ROLE } from './roles';

/** Prose in a migration is not executable SQL; assertions target statements only. */
const statementsOf = (sql: string): string => sql.replace(/--[^\n]*/g, '');

describe('migration files', () => {
  it('are ordered, idempotent SQL with stable checksums', () => {
    const migrations = readMigrations();
    expect(migrations.map((m) => m.filename)).toEqual([
      '001_schema.sql',
      '002_roles.sql',
      '003_policies.sql',
      '004_poll.sql',
      '005_reconcile.sql',
    ]);
    for (const migration of migrations) {
      expect(migration.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(migration.sql.length).toBeGreaterThan(0);
    }
  });

  it('creates every object with IF NOT EXISTS or a DROP-then-CREATE pair', () => {
    const [schema, roles, policies] = readMigrations();
    const createTables = schema.sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g);
    expect(createTables).toBeNull();
    const createIndexes = schema.sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g);
    expect(createIndexes).toBeNull();
    expect(roles.sql).toContain('NOBYPASSRLS');
    expect(statementsOf(roles.sql)).not.toMatch(/PASSWORD/i);
    const createdPolicies = [...policies.sql.matchAll(/CREATE POLICY (\w+)/g)].map((m) => m[1]);
    const droppedPolicies = [...policies.sql.matchAll(/DROP POLICY IF EXISTS (\w+)/g)].map(
      (m) => m[1],
    );
    expect(createdPolicies.sort()).toEqual(droppedPolicies.sort());
  });

  it('never special-cases the system tenant sentinel in a policy', () => {
    for (const migration of readMigrations()) {
      expect(statementsOf(migration.sql)).not.toContain('__SYSTEM__');
    }
  });

  it('ships no credential, connection string or working default', () => {
    for (const migration of readMigrations()) {
      const sql = statementsOf(migration.sql);
      expect(sql).not.toMatch(/postgres(ql)?:\/\//i);
      expect(sql).not.toMatch(/\bPASSWORD\b/i);
      expect(sql).not.toMatch(/\bmyuser\b|\bmypassword\b/i);
    }
  });
});

describe('role credentials', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('requires every role password to be operator-supplied', () => {
    process.env = { ...OLD_ENV };
    delete process.env.CHAT_SEARCH_OWNER_PASSWORD;
    delete process.env.CHAT_SEARCH_WRITER_PASSWORD;
    delete process.env.CHAT_SEARCH_READER_PASSWORD;

    expect(() => assertRoleCredentialsConfigured()).toThrow(
      /missing required role credentials.*CHAT_SEARCH_OWNER_PASSWORD/,
    );
  });

  it('passes once the operator supplies all three', () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: 'supplied',
      CHAT_SEARCH_WRITER_PASSWORD: 'supplied',
      CHAT_SEARCH_READER_PASSWORD: 'supplied',
    };
    expect(() => assertRoleCredentialsConfigured()).not.toThrow();
  });
});

const SCRAM_VERIFIER = /^SCRAM-SHA-256\$(\d+):([\w+/=]+)\$([\w+/=]+):([\w+/=]+)$/;

describe('role password verifiers', () => {
  const PASSWORD = 'correct horse battery staple';

  it('carries no trace of the cleartext and salts every derivation separately', () => {
    const verifier = scramSha256Verifier(PASSWORD);
    expect(verifier).toMatch(SCRAM_VERIFIER);
    expect(verifier).not.toContain(PASSWORD);
    expect(Number(SCRAM_VERIFIER.exec(verifier)?.[1])).toBeGreaterThanOrEqual(4096);
    expect(scramSha256Verifier(PASSWORD)).not.toBe(verifier);
  });

  /** The two keys PostgreSQL checks an authentication attempt against, in order. */
  it('publishes the StoredKey and the ServerKey for the salt it chose', () => {
    const parsed = SCRAM_VERIFIER.exec(scramSha256Verifier(PASSWORD));
    expect(parsed).not.toBeNull();
    const [, iterations, salt, storedKey, serverKey] = parsed ?? [];
    const saltedPassword = pbkdf2Sync(
      PASSWORD,
      Buffer.from(salt, 'base64'),
      Number(iterations),
      32,
      'sha256',
    );
    const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest();
    expect(createHash('sha256').update(clientKey).digest('base64')).toBe(storedKey);
    expect(createHmac('sha256', saltedPassword).update('Server Key').digest('base64')).toBe(
      serverKey,
    );
  });
});

const DB_NAME = 'migrate';

describePg('chat_search migrations (live PostgreSQL)', () => {
  let pool: SearchPool;

  beforeAll(async () => {
    pool = await migrateFresh(DB_NAME);
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await dropIsolatedDatabase(pool, DB_NAME);
    }
  });

  it('is idempotent — a second run applies nothing', async () => {
    const applied = await migrate(pool);
    expect(applied).toEqual([]);
  });

  it('creates the documents primary key in scope order', async () => {
    const { rows } = await pool.query<{ attname: string; ord: number }>(
      `SELECT a.attname, k.ord
         FROM pg_constraint c
         JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.conname = 'documents_pkey'
        ORDER BY k.ord`,
    );
    expect(rows.map((r) => r.attname)).toEqual(['tenant_id', 'user_id', 'kind', 'record_id']);
  });

  it('generates the tsvector with title weight A and body weight B', async () => {
    const { rows } = await pool.query<{ is_generated: string; expression: string }>(
      `SELECT a.attgenerated AS is_generated, pg_get_expr(d.adbin, d.adrelid) AS expression
         FROM pg_attribute a
         JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = 'chat_search.documents'::regclass AND a.attname = 'search_vector'`,
    );
    expect(rows[0].is_generated).toBe('s');
    expect(rows[0].expression).toContain("setweight(to_tsvector('simple'::regconfig");
    expect(rows[0].expression).toMatch(/COALESCE\(title, ''::text\)[^|]*'A'::"char"/);
    expect(rows[0].expression).toMatch(/COALESCE\(body, ''::text\)[^|]*'B'::"char"/);
  });

  it('creates the FTS, trigram and expiration indexes', async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'chat_search'`,
    );
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName.get('documents_fts_idx')).toContain('gin (search_vector)');
    expect(byName.get('documents_title_trgm_idx')).toContain('gin_trgm_ops');
    expect(byName.get('documents_body_trgm_idx')).toContain('gin_trgm_ops');
    expect(byName.get('documents_expires_idx')).toContain('expires_at IS NOT NULL');
    expect(byName.get('outbox_key_idx')).toBeDefined();
    expect(byName.get('embeddings_hnsw_cosine_idx')).toContain('hnsw');
  });

  /**
   * The reconciliation walk pages the whole projection every hour. Served by the
   * primary key it reads every kind's index entries to return one kind's rows,
   * because `kind` sits between the columns the resume compares. Leading with
   * `kind` makes the page a contiguous, index-only range instead.
   */
  it('serves the reconciliation walk from a covering index rather than the primary key', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'chat_search' AND indexname = 'documents_reconcile_idx'`,
    );
    expect(rows[0]?.indexdef).toContain('(kind, tenant_id, user_id, record_id)');
    expect(rows[0]?.indexdef).toContain('WHERE (deleted_at IS NULL)');

    const { rows: plan } = await pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT tenant_id, user_id, record_id
         FROM chat_search.documents
        WHERE kind = 'message' AND deleted_at IS NULL
          AND (tenant_id, user_id, record_id) > ('__BASE__', 'u', 'r')
        ORDER BY tenant_id, user_id, record_id
        LIMIT 1000`,
    );
    const explained = plan.map((row) => row['QUERY PLAN']).join('\n');
    expect(explained).toContain('documents_reconcile_idx');
    /** A sort here would mean the index no longer matches the walk's order. */
    expect(explained).not.toContain('Sort');
  });

  it('cascades embeddings when the owning document row is deleted', async () => {
    await pool.query(
      `INSERT INTO chat_search.documents
         (tenant_id, user_id, kind, record_id, projection_version)
       VALUES ('t1', 'u1', 'message', 'm1', 1)`,
    );
    await pool.query(
      `INSERT INTO chat_search.embeddings
         (tenant_id, user_id, kind, record_id, space, embedding_input_hash, model,
          dimensions, normalized, formatter_version, embedding)
       VALUES ('t1','u1','message','m1','chat-v1','h1','qwen3-embedding-8b',
               1024, true, 'v1', $1::vector)`,
      [`[${new Array(1024).fill(0.01).join(',')}]`],
    );
    await pool.query(
      `DELETE FROM chat_search.documents WHERE tenant_id='t1' AND user_id='u1'
        AND kind='message' AND record_id='m1'`,
    );
    const { rows } = await pool.query('SELECT 1 FROM chat_search.embeddings');
    expect(rows).toHaveLength(0);
  });

  it('carries the fencing token and gap barrier the outbox consumer needs', async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'chat_search' AND table_name = 'watermark'
        ORDER BY column_name`,
    );
    const columns = new Map(rows.map((r) => [r.column_name, r.data_type]));
    expect(columns.get('applied_seq')).toBe('bigint');
    expect(columns.get('applied_version')).toBe('bigint');
    /** Fences a consumer that wakes up after losing the lease. */
    expect(columns.get('lease_epoch')).toBe('bigint');
    /**
     * An aborted transaction burns its `outbox_seq` permanently, so a pure
     * contiguous-prefix rule would stall forever. The barrier records the
     * snapshot bound at which the gap becomes provably permanent.
     */
    expect(columns.get('gap_barrier_seq')).toBe('bigint');
    expect(columns.get('gap_barrier_xmax')).toBe('numeric');
  });

  it('names the outbox timestamp column the consumer reads', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'chat_search' AND table_name = 'outbox'
          AND column_name = 'enqueued_at'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('passes the role separation gate', async () => {
    await expect(findRoleViolations(pool)).resolves.toEqual([]);
  });

  it('denies the request reader every privilege on outbox and watermark', async () => {
    const { rows } = await pool.query<{ outbox: boolean; watermark: boolean }>(
      `SELECT has_table_privilege($1, 'chat_search.outbox', 'SELECT') AS outbox,
              has_table_privilege($1, 'chat_search.watermark', 'SELECT') AS watermark`,
      [READER_ROLE],
    );
    expect(rows[0]).toEqual({ outbox: false, watermark: false });
  });
});

/**
 * The documented provisioning flow, run end to end: a bootstrap connection that
 * already exists applies the migrations, the runner sets the role passwords, and
 * only then can the writer and reader log in.
 *
 * The ordering is the whole point. Neither application role exists before
 * `002_roles.sql` runs and neither has a password before `applyRolePasswords`,
 * so a documented connection string naming one of them cannot authenticate on a
 * fresh installation — which is what the preflight below now refuses to let
 * happen silently.
 */
const PROVISION_DB = 'provision';
/**
 * Generated per run, never written down. The three role names are production
 * names in a cluster-global namespace, so a literal here is a working credential
 * on every shared development and CI server this suite has ever run against, and
 * one published in the repository at that.
 */
const PROVISION_PASSWORD = randomBytes(24).toString('base64url');
/** A non-superuser role that is not one of the three the migrations manage. */
const BOOTSTRAP_ROLE = 'chat_search_test_bootstrap';

/** A connection that survives the database being dropped from under it. */
function rolePool(database: string, role: string): SearchPool {
  const pool = new Pool({
    connectionString: roleDatabaseUrl(database, role, PROVISION_PASSWORD),
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', () => undefined);
  return pool;
}

/**
 * Roles outlive the databases these suites create, so the run takes them with it
 * however it ends. A role still owning objects in another suite's database
 * cannot be dropped; clearing its password is what stops a login surviving the
 * run in that case.
 */
async function removeClusterRoles(): Promise<void> {
  if (!TEST_URL) {
    return;
  }
  const admin = new Pool({ connectionString: TEST_URL, max: 1 });
  try {
    for (const role of [...MANAGED_ROLES, BOOTSTRAP_ROLE]) {
      const dropped = await admin
        .query(`DROP ROLE IF EXISTS ${role}`)
        .then(() => true)
        .catch(() => false);
      if (dropped) {
        continue;
      }
      await admin.query(`ALTER ROLE ${role} WITH PASSWORD NULL`).catch(() => undefined);
    }
  } finally {
    await admin.end().catch(() => undefined);
  }
}

afterAll(removeClusterRoles);

/** Every statement and bind value the runner puts on the wire, in order. */
function recordingPool(database: string, sent: string[]): SearchPool {
  const pool = new Pool({ connectionString: isolatedDatabaseUrl(database), max: 1 });
  pool.on('connect', (client: PoolClient) => {
    const send = client.query.bind(client);
    client.query = ((text: string, values?: string[]) => {
      sent.push(text, ...(values ?? []));
      return send(text, values);
    }) as typeof client.query;
  });
  return pool;
}

describePg('provisioning from an empty database', () => {
  const OLD_ENV = process.env;
  let pool: SearchPool;
  let writer: SearchPool | null = null;
  let reader: SearchPool | null = null;
  let owner: SearchPool | null = null;

  beforeAll(async () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_WRITER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_READER_PASSWORD: PROVISION_PASSWORD,
    };
    pool = await createIsolatedDatabase(PROVISION_DB);
  }, 60_000);

  afterAll(async () => {
    process.env = OLD_ENV;
    await writer?.end().catch(() => undefined);
    await reader?.end().catch(() => undefined);
    await owner?.end().catch(() => undefined);
    if (pool) {
      await dropIsolatedDatabase(pool, PROVISION_DB);
    }
  });

  it('applies every migration in order, as a bootstrap connection', async () => {
    expect(await migrate(pool)).toEqual([
      '001_schema.sql',
      '002_roles.sql',
      '003_policies.sql',
      '004_poll.sql',
      '005_reconcile.sql',
    ]);
    await expect(findRoleViolations(pool)).resolves.toEqual([]);
  }, 60_000);

  it('makes the writer and the reader usable, and only as themselves', async () => {
    expect(await applyRolePasswords(pool)).toEqual([
      'chat_search_owner',
      'chat_search_writer',
      'chat_search_reader',
    ]);

    writer = rolePool(PROVISION_DB, WRITER_ROLE);
    reader = rolePool(PROVISION_DB, READER_ROLE);

    await writer.query(
      `INSERT INTO chat_search.documents
         (tenant_id, user_id, kind, record_id, title, body, projection_version)
       VALUES ('__BASE__', 'alice', 'message', 'm-p1', 'provisioned', 'body', 1)`,
    );

    const scoped = await reader.connect();
    try {
      await scoped.query('BEGIN');
      await scoped.query('SELECT set_config($1, $2, true), set_config($3, $4, true)', [
        'chat_search.tenant_id',
        '__BASE__',
        'chat_search.user_id',
        'alice',
      ]);
      const { rows } = await scoped.query<{ record_id: string }>(
        'SELECT record_id FROM chat_search.documents',
      );
      expect(rows.map((row) => row.record_id)).toEqual(['m-p1']);
      await scoped.query('ROLLBACK');
    } finally {
      scoped.release();
    }

    /** Still exactly the reader: nothing at all on the projector-only tables. */
    await expect(reader.query('SELECT 1 FROM chat_search.outbox')).rejects.toThrow(/permission/);
  }, 60_000);

  /**
   * `ALTER ROLE` is DDL, so its text lands in the server log on any cluster
   * auditing DDL, and on the `STATEMENT:` line of any failure regardless. The
   * password therefore has to be hashed before it is sent, not merely kept out of
   * this process's own logs — and the role still has to be able to log in with it.
   */
  it('puts no cleartext password on the wire, and the role still authenticates', async () => {
    const sent: string[] = [];
    const recorder = recordingPool(PROVISION_DB, sent);
    try {
      expect(await applyRolePasswords(recorder)).toContain('chat_search_owner');
    } finally {
      await recorder.end().catch(() => undefined);
    }

    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((statement) => statement.includes(PROVISION_PASSWORD))).toEqual([]);
    expect(sent.filter((statement) => statement.includes('SCRAM-SHA-256$'))).not.toEqual([]);

    owner = rolePool(PROVISION_DB, 'chat_search_owner');
    const { rows } = await owner.query<{ role: string }>('SELECT current_user AS role');
    expect(rows[0].role).toBe('chat_search_owner');
  }, 60_000);
});

const PREFLIGHT_DB = 'preflight';

describePg('provisioning preflight', () => {
  let pool: SearchPool;

  beforeAll(async () => {
    /** The roles and their passwords come from the provisioning suite's own run. */
    pool = await migrateFresh(PREFLIGHT_DB);
    const OLD_ENV = process.env;
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_WRITER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_READER_PASSWORD: PROVISION_PASSWORD,
    };
    await applyRolePasswords(pool);
    process.env = OLD_ENV;
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      /** Roles are cluster-wide, so this one is cleaned up rather than left behind. */
      await pool
        .query(`REVOKE ALL ON DATABASE chat_search_test_${PREFLIGHT_DB} FROM ${BOOTSTRAP_ROLE}`)
        .catch(() => undefined);
      await pool.query(`DROP ROLE IF EXISTS ${BOOTSTRAP_ROLE}`).catch(() => undefined);
      await dropIsolatedDatabase(pool, PREFLIGHT_DB);
    }
  });

  it('lists the roles the migrations create and the extensions they need', () => {
    expect(MANAGED_ROLES).toEqual([
      'chat_search_owner',
      'chat_search_writer',
      'chat_search_reader',
    ]);
    expect(REQUIRED_EXTENSIONS).toEqual(['pg_trgm', 'vector']);
  });

  /**
   * The privilege that is easiest to get wrong: CREATEROLE looks sufficient, and
   * it is not — asserting `NOSUPERUSER NOBYPASSRLS` on every run is a superuser
   * operation in either direction.
   */
  it('refuses a merely CREATEROLE connection, naming the reason', async () => {
    await pool.query(
      `DO $$ BEGIN
         BEGIN CREATE ROLE ${BOOTSTRAP_ROLE} LOGIN CREATEROLE PASSWORD '${PROVISION_PASSWORD}';
         EXCEPTION WHEN duplicate_object THEN NULL; END;
       END $$`,
    );
    await pool.query(`ALTER ROLE ${BOOTSTRAP_ROLE} WITH PASSWORD '${PROVISION_PASSWORD}'`);
    await pool.query(
      `GRANT CREATE ON DATABASE chat_search_test_${PREFLIGHT_DB} TO ${BOOTSTRAP_ROLE}`,
    );
    await pool.query('DELETE FROM chat_search.migrations');

    const asBootstrap = rolePool(PREFLIGHT_DB, BOOTSTRAP_ROLE);
    try {
      await expect(migrate(asBootstrap)).rejects.toThrow(
        /asserts NOSUPERUSER and NOBYPASSRLS on all three roles/,
      );
    } finally {
      await asBootstrap.end().catch(() => undefined);
    }
  }, 60_000);

  /**
   * The failure this replaces was not a clean one. Connected as
   * `chat_search_owner`, the run strips its own CREATEROLE partway through
   * `002_roles.sql` and every later `ALTER ROLE` fails, so the writer and reader
   * end up created and unusable and the reason is nowhere near the error.
   */
  it('refuses to provision as a role the role migration itself restricts', async () => {
    await pool.query('DELETE FROM chat_search.migrations');
    const asOwner = rolePool(PREFLIGHT_DB, 'chat_search_owner');
    try {
      await expect(migrate(asOwner)).rejects.toThrow(
        /002_roles\.sql creates and then restricts chat_search_owner/,
      );
      /** Refused before any DDL: the tracking table it would have created is gone. */
      const { rows } = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM chat_search.migrations',
      );
      expect(rows[0].count).toBe('0');
    } finally {
      await asOwner.end().catch(() => undefined);
    }
  }, 60_000);

  it('refuses to provision as the reader, which can create nothing at all', async () => {
    const asReader = rolePool(PREFLIGHT_DB, READER_ROLE);
    try {
      await expect(migrate(asReader)).rejects.toThrow(
        /002_roles\.sql creates and then restricts chat_search_reader/,
      );
    } finally {
      await asReader.end().catch(() => undefined);
    }
  }, 60_000);
});

const EXTENSION_DB = 'extschema';
/** Where an operator who keeps extensions out of `public` typically puts them. */
const EXTENSION_SCHEMA = 'extensions';

describePg('provisioning against extensions installed elsewhere', () => {
  let pool: SearchPool;

  beforeAll(async () => {
    pool = await createIsolatedDatabase(EXTENSION_DB);
    await pool.query(`CREATE SCHEMA ${EXTENSION_SCHEMA}`);
    for (const extension of REQUIRED_EXTENSIONS) {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS ${extension} SCHEMA ${EXTENSION_SCHEMA}`);
    }
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await dropIsolatedDatabase(pool, EXTENSION_DB);
    }
  });

  /**
   * Both extensions are present, so a check matching on `extname` alone sees
   * nothing to say. The schema they are in is the whole problem: the types and
   * operator classes they own resolve through `search_path` and nothing else,
   * and the application roles connect without one.
   */
  it('names the extension and the schema it is in before applying anything', async () => {
    const warn = jest.spyOn(logger, 'warn');
    await expect(migrate(pool)).resolves.toContain('001_schema.sql');

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `pg_trgm (schema ${EXTENSION_SCHEMA}) and vector (schema ${EXTENSION_SCHEMA}) are ` +
          'installed outside the search_path',
      ),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('chat_search_reader'));
  }, 60_000);

  it('says nothing once the extension schema is one the connection searches', async () => {
    await pool.query(
      `ALTER DATABASE chat_search_test_${EXTENSION_DB} SET search_path TO public, ${EXTENSION_SCHEMA}`,
    );
    await pool.query('DELETE FROM chat_search.migrations');

    const warn = jest.spyOn(logger, 'warn');
    const searching = new Pool({ connectionString: isolatedDatabaseUrl(EXTENSION_DB), max: 1 });
    try {
      await expect(migrate(searching)).resolves.toContain('001_schema.sql');
    } finally {
      await searching.end().catch(() => undefined);
    }
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('installed outside the search_path'),
    );
  }, 60_000);

  /** USAGE is not what resolves the objects, but without it nothing can. */
  it('refuses outright when the extension schema is one it may not use', async () => {
    await pool.query(`ALTER DATABASE chat_search_test_${EXTENSION_DB} RESET search_path`);
    await pool.query(
      `DO $$ BEGIN
         BEGIN CREATE ROLE ${BOOTSTRAP_ROLE} LOGIN CREATEROLE;
         EXCEPTION WHEN duplicate_object THEN NULL; END;
       END $$`,
    );
    await pool.query(`ALTER ROLE ${BOOTSTRAP_ROLE} WITH PASSWORD '${PROVISION_PASSWORD}'`);
    await pool.query(
      `GRANT CREATE ON DATABASE chat_search_test_${EXTENSION_DB} TO ${BOOTSTRAP_ROLE}`,
    );
    await pool.query(`REVOKE ALL ON SCHEMA ${EXTENSION_SCHEMA} FROM ${BOOTSTRAP_ROLE}`);
    /** Only the schema file is outstanding, so the superuser-only role gate is not what fires. */
    await pool.query(`DELETE FROM chat_search.migrations WHERE filename = '001_schema.sql'`);
    await pool.query(`GRANT USAGE ON SCHEMA chat_search TO ${BOOTSTRAP_ROLE}`);
    await pool.query(`GRANT SELECT ON chat_search.migrations TO ${BOOTSTRAP_ROLE}`);

    const asBootstrap = rolePool(EXTENSION_DB, BOOTSTRAP_ROLE);
    try {
      await expect(migrate(asBootstrap)).rejects.toThrow(
        new RegExp(
          `pg_trgm \\(schema ${EXTENSION_SCHEMA}\\) and vector \\(schema ${EXTENSION_SCHEMA}\\) ` +
            `are installed in a schema role ${BOOTSTRAP_ROLE} may not use`,
        ),
      );
    } finally {
      await asBootstrap.end().catch(() => undefined);
      await pool
        .query(`REVOKE ALL ON DATABASE chat_search_test_${EXTENSION_DB} FROM ${BOOTSTRAP_ROLE}`)
        .catch(() => undefined);
    }
  }, 60_000);
});

const FOREIGN_ROLE_DB = 'foreignroles';

describePg('provisioning a database whose roles the cluster already has', () => {
  let pool: SearchPool;

  beforeAll(async () => {
    pool = await createIsolatedDatabase(FOREIGN_ROLE_DB);
    for (const role of MANAGED_ROLES) {
      await pool.query(
        `DO $$ BEGIN
           BEGIN CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS;
           EXCEPTION WHEN duplicate_object THEN NULL; END;
         END $$`,
      );
    }
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await dropIsolatedDatabase(pool, FOREIGN_ROLE_DB);
    }
  });

  /**
   * The role names are fixed and cluster-global while every grant is
   * per-database, so a second deployment on the same server silently rotates the
   * first one's credentials. Roles that predate this database's own role
   * migration are the only sign of it available before the damage is done.
   */
  it('warns that the roles are cluster-global, and only while they are unclaimed here', async () => {
    const warn = jest.spyOn(logger, 'warn');
    await migrate(pool);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('already exist on this server, but 002_roles.sql has never been'),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/cluster-global/));

    warn.mockClear();
    await migrate(pool);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('already exist on this server'));
  }, 60_000);
});
