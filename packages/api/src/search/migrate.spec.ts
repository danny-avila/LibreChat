import os from 'os';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { logger } from '@librechat/data-schemas';
import { createHash, randomBytes } from 'crypto';
import type { PoolClient } from 'pg';
import type { SearchPool } from './types';
import {
  applyRolePasswords,
  assertRoleCredentialsConfigured,
  managedRoleNames,
  migrate,
  migrationsDir,
  provisionChatSearch,
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
import {
  assertManagedRoleUrl,
  chatSearchRolePrefix,
  findRoleViolations,
  managedRoles,
  READER_ROLE,
  WRITER_ROLE,
} from './roles';

/** Prose in a migration is not executable SQL; assertions target statements only. */
const statementsOf = (sql: string): string => sql.replace(/--[^\n]*/g, '');

/** Raw file bytes, deliberately not `readMigrations()`: the freeze pin is on what is on disk, before prefix rendering. */
const readRawMigrationFiles = (): ReadonlyArray<[string, string]> =>
  fs
    .readdirSync(migrationsDir())
    .filter((filename) => filename.endsWith('.sql'))
    .sort()
    .map((filename) => [filename, fs.readFileSync(path.join(migrationsDir(), filename), 'utf8')]);

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('migration files', () => {
  it('are ordered, idempotent SQL with stable checksums', () => {
    const migrations = readMigrations();
    expect(migrations.map((m) => m.filename)).toEqual([
      '001_schema.sql',
      '002_roles.sql',
      '003_policies.sql',
      '004_poll.sql',
      '005_reconcile.sql',
      '006_tiebreak.sql',
    ]);
    for (const migration of migrations) {
      expect(migration.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(migration.sql.length).toBeGreaterThan(0);
    }
  });

  /**
   * An applied migration file is frozen: its checksum is recorded by every
   * provisioned database, and the runner treats an applied file whose text
   * changed as drift — so an in-place amendment, however small, parks
   * projection on every deployment the previous layer already provisioned.
   * These are the parent layer's shipped bytes; changing this table is only
   * correct alongside a deliberate re-provisioning story. New DDL goes in a
   * new file.
   */
  it('never amends a file the parent layer shipped', () => {
    const frozen = new Map([
      ['001_schema.sql', '49c277f38d8602c85c18ae3146c4a088d845ca9fe6c49f1207f218118081755d'],
      ['002_roles.sql', '25e9e5a595ac51790c4ed3cb5f9cbd4d7ffea1c8cd1af2f434afb139d0bfc080'],
      ['003_policies.sql', 'fc2adbdb1289ef22c2062d4c03a3686d7adfeb8ad5a2403a9a3af059d72d66e7'],
      ['004_poll.sql', '645c503b7df9d3f2234830dabee45f145d120bf6b3996278529a6e57b4eba533'],
      ['005_reconcile.sql', '8831b93885bfa4a394c786db9dfd2b2d8aa467a66cfe97a87f40915612ae96d1'],
    ]);
    for (const [filename, sql] of readRawMigrationFiles()) {
      const expected = frozen.get(filename);
      if (expected === undefined) {
        continue;
      }
      expect(`${filename} ${sha256(sql)}`).toBe(`${filename} ${expected}`);
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

/** Both are deleted by SASLprep, RFC 3454 Table B.1. */
const SOFT_HYPHEN = '\u00AD';
const ZERO_WIDTH_JOINER = '\u200D';

/**
 * One password, spelled two ways. The first is what an operator sets: a
 * decomposed o-umlaut, a no-break space and a soft hyphen, so all three SASLprep
 * steps have something to do. The second is what SASLprep makes of it, and it is
 * what every client actually hashes.
 *
 * An ASCII password cannot distinguish a SASLprepped derivation from a raw one,
 * which is why this pair exists rather than a passphrase.
 */
const MARKED_PASSWORD = `wo\u0308rd\u00A0with${SOFT_HYPHEN}marks`;
const PREPPED_PASSWORD = 'w\u00F6rd withmarks';

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

  /**
   * The one prohibited class an operator reaches by accident: a secret read from
   * a file arrives with its trailing newline. `pg` normalizes such a password and
   * libpq refuses to, so whichever verifier is stored locks one of them out.
   */
  it('refuses a control character, naming the class and the variable', () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: 'supplied',
      CHAT_SEARCH_WRITER_PASSWORD: 'read-from-a-file\n',
      CHAT_SEARCH_READER_PASSWORD: 'supplied',
    };
    expect(() => assertRoleCredentialsConfigured()).toThrow(
      /CHAT_SEARCH_WRITER_PASSWORD contains a control character \(U\+0000-U\+001F/,
    );
  });

  /**
   * The one Table B.1 range `pg` does not strip: libpq maps U+1D173–U+1D17A to
   * nothing, `pg` hashes it, so the two clients derive different bytes from the
   * same password and no stored verifier satisfies both. Refused like the
   * control characters above rather than mapped, because the verifier this
   * module derives has to agree with `pg` byte for byte.
   */
  it('refuses the musical format controls the clients disagree over', () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: 'note\u{1D173}bar\u{1D17A}',
      CHAT_SEARCH_WRITER_PASSWORD: 'supplied',
      CHAT_SEARCH_READER_PASSWORD: 'supplied',
    };
    expect(() => assertRoleCredentialsConfigured()).toThrow(
      /CHAT_SEARCH_OWNER_PASSWORD contains a musical format control \(U\+1D173-U\+1D17A\)/,
    );
  });

  /**
   * libpq's prohibition pass (RFC 4013 §2.3) rejects the private-use character
   * and falls back to hashing the raw bytes; `pg` has no prohibition pass and
   * hashes the normalized ones. They only disagree when SASLprep actually
   * rewrites the string — U+FB01 normalizes to `fi` — so that intersection is
   * refused…
   */
  it('refuses a prohibited character alongside a SASLprep rewrite', () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: 'supplied',
      CHAT_SEARCH_WRITER_PASSWORD: 'x\uFB01\uE000',
      CHAT_SEARCH_READER_PASSWORD: 'supplied',
    };
    expect(() => assertRoleCredentialsConfigured()).toThrow(
      /CHAT_SEARCH_WRITER_PASSWORD mixes characters SASLprep rewrites/,
    );
  });

  /**
   * …and only that intersection: with nothing for SASLprep to rewrite, libpq's
   * raw fallback and pg's prep output are byte-identical, both clients
   * authenticate, and refusing would reject a working password.
   */
  it('accepts a prohibited character when SASLprep leaves the password untouched', () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: 'supplied',
      CHAT_SEARCH_WRITER_PASSWORD: 'x\uE000y',
      CHAT_SEARCH_READER_PASSWORD: 'supplied',
    };
    expect(() => assertRoleCredentialsConfigured()).not.toThrow();
  });

  /**
   * The bidirectional half of the same prohibition pass: Hebrew first and last
   * with a Latin letter in between (the `fi` U+FB01 normalizes to) violates
   * RFC 3454 §6, so libpq falls back to raw bytes while `pg` normalizes.
   */
  it('refuses a bidi-invalid password alongside a SASLprep rewrite', () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: '\u05E9\uFB01\u05DD',
      CHAT_SEARCH_WRITER_PASSWORD: 'supplied',
      CHAT_SEARCH_READER_PASSWORD: 'supplied',
    };
    expect(() => assertRoleCredentialsConfigured()).toThrow(
      /CHAT_SEARCH_OWNER_PASSWORD mixes characters SASLprep rewrites/,
    );
  });

  it('refuses a password SASLprep deletes down to nothing', () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: 'supplied',
      CHAT_SEARCH_WRITER_PASSWORD: 'supplied',
      CHAT_SEARCH_READER_PASSWORD: SOFT_HYPHEN + ZERO_WIDTH_JOINER,
    };
    expect(() => assertRoleCredentialsConfigured()).toThrow(
      /CHAT_SEARCH_READER_PASSWORD is empty once SASLprep removes/,
    );
  });
});

const SCRAM_VERIFIER = /^SCRAM-SHA-256\$(\d+):([\w+/=]+)\$([\w+/=]+):([\w+/=]+)$/;

/**
 * Shape only. Whether the keys inside are the *right* keys is not decidable from
 * here — re-deriving them with the same algorithm the code under test uses would
 * agree with any derivation, including one that skips SASLprep and locks every
 * client out. That question is settled by logging in, further down.
 */
describe('role password verifiers', () => {
  it('carries no trace of the cleartext and salts every derivation separately', () => {
    const verifier = scramSha256Verifier(MARKED_PASSWORD);
    expect(verifier).toMatch(SCRAM_VERIFIER);
    expect(verifier).not.toContain(MARKED_PASSWORD);
    expect(verifier).not.toContain(PREPPED_PASSWORD);
    expect(Number(SCRAM_VERIFIER.exec(verifier)?.[1])).toBeGreaterThanOrEqual(4096);
    expect(scramSha256Verifier(MARKED_PASSWORD)).not.toBe(verifier);
  });
});

describe('role prefix', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('applies the prefix to every managed name', () => {
    process.env = { ...OLD_ENV, CHAT_SEARCH_ROLE_PREFIX: 'alpha_' };
    expect(managedRoleNames()).toEqual([
      'alpha_chat_search_owner',
      'alpha_chat_search_writer',
      'alpha_chat_search_reader',
    ]);
  });

  it('resolves the prefix through a named variable, as REDIS_KEY_PREFIX_VAR does', () => {
    process.env = { ...OLD_ENV, DEPLOY_ID: 'beta_', CHAT_SEARCH_ROLE_PREFIX_VAR: 'DEPLOY_ID' };
    expect(managedRoles().reader).toBe('beta_chat_search_reader');
  });

  it('refuses both variables at once', () => {
    process.env = { ...OLD_ENV, CHAT_SEARCH_ROLE_PREFIX: 'a_', CHAT_SEARCH_ROLE_PREFIX_VAR: 'X' };
    expect(() => chatSearchRolePrefix()).toThrow(/Only either/);
  });

  it('refuses a prefix that is not a safe lowercase identifier', () => {
    process.env = { ...OLD_ENV, CHAT_SEARCH_ROLE_PREFIX: 'Staging-1' };
    expect(() => chatSearchRolePrefix()).toThrow(/not a safe PostgreSQL identifier/);
  });

  it('refuses a prefix that would push a name past the identifier limit', () => {
    process.env = { ...OLD_ENV, CHAT_SEARCH_ROLE_PREFIX: 'x'.repeat(50) };
    expect(() => chatSearchRolePrefix()).toThrow(/identifier limit/);
  });

  /**
   * The rendered text is what gets applied and checksummed, so the prefix has
   * to reach every role identifier in every file — a single missed occurrence
   * would grant or audit the wrong principal — and two prefixes must never
   * produce the same checksum, which is what makes a later prefix change
   * surface as drift instead of a silent second set of roles.
   */
  it('renders the prefix into every migration file that names a role', () => {
    process.env = { ...OLD_ENV, CHAT_SEARCH_ROLE_PREFIX: 'alpha_' };
    const rendered = readMigrations();
    for (const migration of rendered) {
      expect(migration.sql).not.toMatch(/\bchat_search_(owner|writer|reader)\b/);
    }

    process.env = { ...OLD_ENV };
    const bare = readMigrations();
    expect(bare.map((m) => m.checksum)).not.toEqual(rendered.map((m) => m.checksum));
  });
});

describe('runtime role URLs', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  it('accepts the slot role, however encoded', () => {
    expect(() =>
      assertManagedRoleUrl(
        'CHAT_SEARCH_DATABASE_URL',
        'postgres://chat_search_reader:pw@db:5432/x',
        'reader',
      ),
    ).not.toThrow();
    expect(() =>
      assertManagedRoleUrl(
        'CHAT_SEARCH_DATABASE_URL',
        'postgres://chat_search%5Freader:pw@db/x',
        'reader',
      ),
    ).not.toThrow();
  });

  /**
   * The writer in the reader slot returns correctly scoped rows — the query
   * predicates scope on their own — while the row-security layer beneath them
   * is silently gone. A defence that can vanish without a symptom has to be
   * refused at boot, not discovered in an audit.
   */
  it('refuses our own role in the wrong slot', () => {
    expect(() =>
      assertManagedRoleUrl(
        'CHAT_SEARCH_DATABASE_URL',
        'postgres://chat_search_writer:pw@db/x',
        'reader',
      ),
    ).toThrow(/must connect as chat_search_reader/);
    expect(() =>
      assertManagedRoleUrl(
        'CHAT_SEARCH_WRITER_URL',
        'postgres://chat_search_owner:pw@db/x',
        'writer',
      ),
    ).toThrow(/DDL owner/);
  });

  it('follows the deployment prefix', () => {
    process.env = { ...OLD_ENV, CHAT_SEARCH_ROLE_PREFIX: 'alpha_' };
    expect(() =>
      assertManagedRoleUrl(
        'CHAT_SEARCH_DATABASE_URL',
        'postgres://alpha_chat_search_writer:pw@db/x',
        'reader',
      ),
    ).toThrow(/alpha_chat_search_reader/);
  });

  it('warns on an unknown role, which may be a membership', () => {
    const warn = jest.spyOn(logger, 'warn');
    expect(() =>
      assertManagedRoleUrl('CHAT_SEARCH_DATABASE_URL', 'postgres://svc_reader:pw@db/x', 'reader'),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('svc_reader'));
  });

  it('leaves URLs without a username to the server', () => {
    const warn = jest.spyOn(logger, 'warn');
    expect(() =>
      assertManagedRoleUrl('CHAT_SEARCH_DATABASE_URL', 'postgres://db:5432/x', 'reader'),
    ).not.toThrow();
    expect(() =>
      assertManagedRoleUrl('CHAT_SEARCH_DATABASE_URL', 'not a url', 'reader'),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
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

  /**
   * Column grants live in `pg_attribute.attacl`, not the relation ACL, so an
   * audit reading only `relacl` certifies this state as clean — while a
   * `SET ROLE` reader session reads both tenants' outbox keys, because the
   * outbox has no policy protecting it. The audit must see both ACL axes.
   */
  it('reports a column-level grant the relation ACL never mentions', async () => {
    await pool.query(`GRANT SELECT (tenant_id, user_id) ON chat_search.outbox TO ${READER_ROLE}`);
    try {
      const violations = await findRoleViolations(pool);
      expect(violations).toEqual(
        expect.arrayContaining([
          {
            role: READER_ROLE,
            problem: 'has column-level SELECT on chat_search.outbox.tenant_id',
          },
          {
            role: READER_ROLE,
            problem: 'has column-level SELECT on chat_search.outbox.user_id',
          },
        ]),
      );
    } finally {
      await pool.query(
        `REVOKE SELECT (tenant_id, user_id) ON chat_search.outbox FROM ${READER_ROLE}`,
      );
    }
    await expect(findRoleViolations(pool)).resolves.toEqual([]);
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
 *
 * The marks on the end put the production path — `applyRolePasswords`, then a
 * real login — over a password SASLprep rewrites, which is the case that used to
 * produce a role nothing could authenticate as.
 */
const PROVISION_PASSWORD = `${randomBytes(18).toString('base64url')}${MARKED_PASSWORD}`;
/**
 * Stamped into every role this file creates, so teardown can tell a role this run
 * made from one that was already on the server, and two runs against one cluster
 * do not collide.
 */
const RUN_ID = randomBytes(4).toString('hex');
/** A non-superuser role that is not one of the three the migrations manage. */
const BOOTSTRAP_ROLE = `chat_search_test_bootstrap_${RUN_ID}`;
/** Run-scoped deployment prefixes, so the isolation suite's roles are this run's own. */
const PREFIX_A = `p${RUN_ID}a_`;
const PREFIX_B = `p${RUN_ID}b_`;
/** Owned entirely by the SASLprep suite below: created, used, and dropped there. */
const SASLPREP_ROLE = `chat_search_test_saslprep_${RUN_ID}`;

/** A connection that survives the database being dropped from under it. */
function rolePool(
  database: string,
  role: string,
  password: string = PROVISION_PASSWORD,
): SearchPool {
  const pool = new Pool({
    connectionString: roleDatabaseUrl(database, role, password),
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', () => undefined);
  return pool;
}

/**
 * Roles outlive the databases these suites create, so the run takes its own with
 * it however it ends — and only its own. Every name here carries this run's id,
 * which no role the suite did not create can have.
 *
 * The three managed roles are deliberately absent. They are production names in
 * a cluster-global namespace, so dropping them — or clearing their passwords —
 * takes the credentials off any deployment sharing this server, which is the
 * same blast radius as leaving one behind, pointed the other way. The password
 * this run gives them is random and never written down, so nothing usable
 * survives it; what does survive is a rotated credential, and no teardown can
 * undo that. Only role names that differ per deployment can, which is the
 * arrangement `warnOnForeignManagedRoles` already asks an operator for.
 */
async function dropRolesThisRunCreated(): Promise<void> {
  if (!TEST_URL) {
    return;
  }
  const admin = new Pool({ connectionString: TEST_URL, max: 1 });
  try {
    const prefixed = [PREFIX_A, PREFIX_B].flatMap((prefix) => [
      `${prefix}chat_search_owner`,
      `${prefix}chat_search_writer`,
      `${prefix}chat_search_reader`,
    ]);
    for (const role of [BOOTSTRAP_ROLE, SASLPREP_ROLE, ...prefixed]) {
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
    }
  } finally {
    await admin.end().catch(() => undefined);
  }
}

afterAll(dropRolesThisRunCreated);

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
      '006_tiebreak.sql',
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

const SASLPREP_DB = 'saslprep';

/**
 * The verifier is derived here and checked by the server, so the two have to
 * agree on what the password *is* before either touches PBKDF2. PostgreSQL used
 * to settle that: `PASSWORD '<cleartext>'` ran the string through `pg_saslprep`
 * server-side. A verifier is stored exactly as supplied, so sending one moves
 * that step into this codebase, where it was missing.
 *
 * Nothing in the provisioning path notices when it goes wrong. `ALTER ROLE`
 * succeeds, the role has LOGIN and a password, and the failure surfaces as
 * `28P01` from some pod at connect time.
 *
 * This suite creates and drops a role of its own rather than borrowing one of
 * the three production names, which are cluster-global and may belong to a
 * deployment sharing the server.
 */
describePg('a role password the client rewrites before hashing', () => {
  let pool: SearchPool;
  const opened: SearchPool[] = [];

  const connectAs = (password: string): SearchPool => {
    const connection = rolePool(SASLPREP_DB, SASLPREP_ROLE, password);
    opened.push(connection);
    return connection;
  };

  beforeAll(async () => {
    pool = await createIsolatedDatabase(SASLPREP_DB);
    await pool.query(
      `DO $$ BEGIN
         BEGIN CREATE ROLE ${SASLPREP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS;
         EXCEPTION WHEN duplicate_object THEN NULL; END;
       END $$`,
    );
    /** Exactly the statement `applyRolePasswords` issues, for a role it does not manage. */
    const { rows } = await pool.query<{ statement: string }>(
      'SELECT format($1, $2::text, $3::text) AS statement',
      ['ALTER ROLE %I WITH LOGIN PASSWORD %L', SASLPREP_ROLE, scramSha256Verifier(MARKED_PASSWORD)],
    );
    await pool.query(rows[0].statement);
  }, 60_000);

  afterAll(async () => {
    for (const connection of opened) {
      await connection.end().catch(() => undefined);
    }
    if (pool) {
      await pool.query(`DROP ROLE IF EXISTS ${SASLPREP_ROLE}`).catch(() => undefined);
      await dropIsolatedDatabase(pool, SASLPREP_DB);
    }
  });

  it('authenticates over TCP with a password every client rewrites before hashing', async () => {
    const { rows } = await connectAs(MARKED_PASSWORD).query<{ role: string }>(
      'SELECT current_user AS role',
    );
    expect(rows[0].role).toBe(SASLPREP_ROLE);
  }, 60_000);

  /**
   * The same login, spelled the way SASLprep leaves it. Both strings reach
   * PBKDF2 as one, so a verifier that admits one and refuses the other was
   * derived from something other than the prepped form.
   */
  it('accepts the prepped spelling of that password as the same password', async () => {
    const { rows } = await connectAs(PREPPED_PASSWORD).query<{ role: string }>(
      'SELECT current_user AS role',
    );
    expect(rows[0].role).toBe(SASLPREP_ROLE);
  }, 60_000);

  /** Without this the two above would pass just as well against a `trust` HBA. */
  it('rejects a password that is neither', async () => {
    await expect(connectAs(`${MARKED_PASSWORD}x`).query('SELECT 1')).rejects.toThrow(
      /password authentication failed/,
    );
  }, 60_000);
});

const PREFLIGHT_DB = 'preflight';

/**
 * The stacked-rollout path: a database the parent layer provisioned (001–005
 * applied, checksums recorded) upgrades to this layer. The run must apply
 * exactly the new file. This is the regression shape behind the freeze pin
 * above — an amended old file is reported as checksum drift here, and boot
 * treats failed provisioning as "projection will not run", cluster-wide.
 */
const UPGRADE_DB = 'upgrade';

describePg('provisioning a database the parent layer already provisioned', () => {
  const OLD_ENV = process.env;
  let pool: SearchPool;

  beforeAll(async () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_WRITER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_READER_PASSWORD: PROVISION_PASSWORD,
    };
    pool = await createIsolatedDatabase(UPGRADE_DB);
  }, 60_000);

  afterAll(async () => {
    process.env = OLD_ENV;
    if (pool) {
      await dropIsolatedDatabase(pool, UPGRADE_DB);
    }
  });

  it('applies only the new migration, never drift', async () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-search-parent-'));
    for (const [filename, sql] of readRawMigrationFiles()) {
      if (filename !== '006_tiebreak.sql') {
        fs.writeFileSync(path.join(parentDir, filename), sql);
      }
    }
    process.env.CHAT_SEARCH_MIGRATIONS_DIR = parentDir;
    try {
      expect(await migrate(pool)).toEqual([
        '001_schema.sql',
        '002_roles.sql',
        '003_policies.sql',
        '004_poll.sql',
        '005_reconcile.sql',
      ]);
    } finally {
      delete process.env.CHAT_SEARCH_MIGRATIONS_DIR;
      fs.rmSync(parentDir, { recursive: true, force: true });
    }

    expect(await migrate(pool)).toEqual(['006_tiebreak.sql']);

    const { rows } = await pool.query<{ mongo_id: string }>(
      `SELECT mongo_id FROM chat_search.poll_cursor LIMIT 0`,
    );
    expect(rows).toEqual([]);
  }, 120_000);
});

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
    expect(managedRoleNames()).toEqual([
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
  const OLD_ENV = process.env;
  let pool: SearchPool;

  beforeAll(async () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_WRITER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_READER_PASSWORD: PROVISION_PASSWORD,
    };
    pool = await createIsolatedDatabase(EXTENSION_DB);
    await pool.query(`CREATE SCHEMA ${EXTENSION_SCHEMA}`);
    for (const extension of REQUIRED_EXTENSIONS) {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS ${extension} SCHEMA ${EXTENSION_SCHEMA}`);
    }
  }, 60_000);

  afterAll(async () => {
    process.env = OLD_ENV;
    if (pool) {
      await dropIsolatedDatabase(pool, EXTENSION_DB);
    }
  });

  /**
   * Both extensions are present, so a check matching on `extname` alone sees
   * nothing to say. The schema they are in is the whole problem: the types and
   * operator classes they own resolve through `search_path` and nothing else,
   * and the application roles connect without one. Provisioning has to hand
   * them one, or the first `::vector` cast a role runs fails at runtime.
   */
  it('lets the reader resolve extension types over its own connection', async () => {
    await expect(migrate(pool)).resolves.toContain('001_schema.sql');
    await applyRolePasswords(pool);

    const { rows: settings } = await pool.query<{ rolname: string; setconfig: string[] }>(
      `SELECT r.rolname, s.setconfig
         FROM pg_db_role_setting s
         JOIN pg_roles r ON r.oid = s.setrole
         JOIN pg_database d ON d.oid = s.setdatabase
        WHERE d.datname = current_database() AND r.rolname = ANY($1::text[])
        ORDER BY r.rolname`,
      [[...managedRoleNames()]],
    );
    expect(settings.map((row) => row.rolname)).toEqual([...managedRoleNames()].sort());
    for (const row of settings) {
      expect(row.setconfig.join(';')).toContain(EXTENSION_SCHEMA);
    }

    const asReader = rolePool(EXTENSION_DB, READER_ROLE);
    try {
      const { rows } = await asReader.query<{ vec: string }>(
        "SELECT '[1,2,3]'::vector::text AS vec",
      );
      expect(rows[0].vec).toBe('[1,2,3]');
    } finally {
      await asReader.end().catch(() => undefined);
    }
  }, 60_000);

  /**
   * `002_roles.sql` is checksum-tracked and never reruns, so it cannot be what
   * repairs a hand-edited role. Extension access is asserted by every run
   * instead, like the passwords: the run below applies no migration files at
   * all and still puts the reader's search_path back.
   */
  it('reasserts role access on a run with nothing left to apply', async () => {
    await pool.query(
      `ALTER ROLE ${READER_ROLE} IN DATABASE chat_search_test_${EXTENSION_DB} SET search_path = public`,
    );
    await expect(migrate(pool)).resolves.toEqual([]);

    const asReader = rolePool(EXTENSION_DB, READER_ROLE);
    try {
      const { rows } = await asReader.query<{ search_path: string }>('SHOW search_path');
      expect(rows[0].search_path).toBe(`pg_catalog, chat_search, ${EXTENSION_SCHEMA}`);
    } finally {
      await asReader.end().catch(() => undefined);
    }
  }, 60_000);

  /** USAGE is not what resolves the objects, but without it nothing can. */
  it('refuses outright when the extension schema is one it may not use', async () => {
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
    for (const role of managedRoleNames()) {
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

const COMPOSE_DB = 'compose';

describePg('provisioning composition', () => {
  const OLD_ENV = process.env;
  let pool: SearchPool;

  beforeAll(async () => {
    pool = await createIsolatedDatabase(COMPOSE_DB);
  }, 60_000);

  afterAll(async () => {
    process.env = OLD_ENV;
    if (pool) {
      await dropIsolatedDatabase(pool, COMPOSE_DB);
    }
  });

  /**
   * The order is the point: a run that created LOGIN roles and only then
   * discovered a missing password would leave roles nothing can authenticate
   * as, and still report success. The refusal has to land before any DDL.
   */
  it('refuses to touch the database until every credential is supplied', async () => {
    process.env = { ...OLD_ENV };
    delete process.env.CHAT_SEARCH_OWNER_PASSWORD;
    delete process.env.CHAT_SEARCH_WRITER_PASSWORD;
    delete process.env.CHAT_SEARCH_READER_PASSWORD;

    await expect(provisionChatSearch(pool)).rejects.toThrow(/missing required role credentials/);

    const { rows } = await pool.query<{ present: boolean }>(
      "SELECT to_regclass('chat_search.migrations') IS NOT NULL AS present",
    );
    expect(rows[0].present).toBe(false);
  });

  /**
   * Resolving is itself the separation proof: the last thing the composition
   * does is read the role and policy state back and throw on any violation.
   */
  it('provisions end to end behind the one composition call', async () => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_OWNER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_WRITER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_READER_PASSWORD: PROVISION_PASSWORD,
    };

    const result = await provisionChatSearch(pool);
    expect(result.applied).toContain('001_schema.sql');
    expect([...result.updated].sort()).toEqual([...managedRoleNames()].sort());
  }, 60_000);
});

const PREFIXED_A_DB = 'prefixa';
const PREFIXED_B_DB = 'prefixb';
const SECOND_PASSWORD = `${PROVISION_PASSWORD}-second`;

describePg('role prefix provisioning', () => {
  const OLD_ENV = process.env;
  let alpha: SearchPool;
  let beta: SearchPool;

  afterAll(async () => {
    process.env = OLD_ENV;
    if (alpha) {
      await dropIsolatedDatabase(alpha, PREFIXED_A_DB);
    }
    if (beta) {
      await dropIsolatedDatabase(beta, PREFIXED_B_DB);
    }
  });

  /**
   * The scenario the prefix exists for. One cluster, two databases, two
   * prefixes, two password sets: provisioning the second deployment must not
   * rotate the first's credentials — the exact failure shared names guarantee —
   * and the first's reader must hold no reach into the second's database.
   */
  it('provisions two deployments on one cluster without sharing credentials', async () => {
    alpha = await createIsolatedDatabase(PREFIXED_A_DB);
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_ROLE_PREFIX: PREFIX_A,
      CHAT_SEARCH_OWNER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_WRITER_PASSWORD: PROVISION_PASSWORD,
      CHAT_SEARCH_READER_PASSWORD: PROVISION_PASSWORD,
    };
    await provisionChatSearch(alpha);
    await expect(findRoleViolations(alpha)).resolves.toEqual([]);

    beta = await createIsolatedDatabase(PREFIXED_B_DB);
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_ROLE_PREFIX: PREFIX_B,
      CHAT_SEARCH_OWNER_PASSWORD: SECOND_PASSWORD,
      CHAT_SEARCH_WRITER_PASSWORD: SECOND_PASSWORD,
      CHAT_SEARCH_READER_PASSWORD: SECOND_PASSWORD,
    };
    await provisionChatSearch(beta);

    const asAlphaReader = rolePool(PREFIXED_A_DB, `${PREFIX_A}chat_search_reader`);
    try {
      const { rows } = await asAlphaReader.query<{ who: string }>('SELECT current_user AS who');
      expect(rows[0].who).toBe(`${PREFIX_A}chat_search_reader`);
    } finally {
      await asAlphaReader.end().catch(() => undefined);
    }

    const crossing = rolePool(PREFIXED_B_DB, `${PREFIX_A}chat_search_reader`);
    try {
      await expect(crossing.query('SELECT count(*) FROM chat_search.documents')).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await crossing.end().catch(() => undefined);
    }
  }, 180_000);
});
