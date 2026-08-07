import type { SearchPool } from './types';
import { describePg, dropIsolatedDatabase, migrateFresh } from './pg.helper';
import { findRoleViolations, READER_ROLE } from './roles';
import { migrate, readMigrations } from './migrate';

/** Prose in a migration is not executable SQL; assertions target statements only. */
const statementsOf = (sql: string): string => sql.replace(/--[^\n]*/g, '');

describe('migration files', () => {
  it('are ordered, idempotent SQL with stable checksums', () => {
    const migrations = readMigrations();
    expect(migrations.map((m) => m.filename)).toEqual([
      '001_schema.sql',
      '002_roles.sql',
      '003_policies.sql',
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
    expect(rows[0].expression).toMatch(/COALESCE\(title, ''::text\)\), 'A'::"char"/);
    expect(rows[0].expression).toMatch(/COALESCE\(body, ''::text\)\), 'B'::"char"/);
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
