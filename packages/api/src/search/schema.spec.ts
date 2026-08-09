import type { SearchPool } from './types';
import { createIsolatedDatabase, describePg, dropIsolatedDatabase } from './pg.helper';
import { readMigrations } from './migrate';
import { withTransaction } from './pool';

type PageRow = { record_id: string; source_updated_at: string };
type Cursor = { updatedAt: string; recordId: string };

const DB_NAME = 'schema';
const EXTENSION_DB_NAME = 'schema_ext';
const SCHEMA_MIGRATION = '001_schema.sql';

/**
 * Only this one file is applied. Everything asserted here is a property of the
 * projection schema itself, and the role and policy migrations that follow it
 * need a superuser the assertions do not.
 */
function schemaMigrationSql(): string {
  const migration = readMigrations().find((candidate) => candidate.filename === SCHEMA_MIGRATION);
  if (!migration) {
    throw new Error(`${SCHEMA_MIGRATION} is missing`);
  }
  return migration.sql;
}

function applySchema(pool: SearchPool): Promise<void> {
  const sql = schemaMigrationSql();
  return withTransaction(pool, async (client) => {
    await client.query(sql);
  });
}

/**
 * A tsvector addresses its lexeme buffer with a 20-bit offset, and repeated words
 * collapse into a single entry, so only *distinct* words push against that limit.
 */
function distinctWords(count: number): string {
  const words: string[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    words[index] = `w${index}`;
  }
  return words.join(' ');
}

/**
 * Three bytes per character in UTF-8 and deliberately non-repeating: a B-tree
 * index tuple may be compressed, so a title built with `repeat()` fits where real
 * prose of the same length does not.
 */
function wideTitle(length: number): string {
  const characters: string[] = new Array(length);
  for (let index = 0; index < length; index += 1) {
    characters[index] = String.fromCharCode(0x4e00 + ((index * 7919 + 13) % 20000));
  }
  return characters.join('');
}

describePg('chat_search projection schema', () => {
  let pool: SearchPool;

  beforeAll(async () => {
    pool = await createIsolatedDatabase(DB_NAME);
    await applySchema(pool);
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await dropIsolatedDatabase(pool, DB_NAME);
    }
  });

  describe('oversized content', () => {
    const body = distinctWords(300_000);
    const title = wideTitle(4000);

    /** Each case seeds its own row, so one oversized write failing hides no other. */
    const insert = (recordId: string, kind: string, rowTitle: string, rowBody: string) =>
      pool.query(
        `INSERT INTO chat_search.documents
           (tenant_id, user_id, kind, record_id, title, body, projection_version)
         VALUES ('t1', 'u1', $1, $2, $3, $4, nextval('chat_search.projection_version_seq'))`,
        [kind, recordId, rowTitle, rowBody],
      );

    /**
     * The vector is a STORED generated column, so a `to_tsvector` failure aborts
     * the whole write: an oversized document stops being *stored*, not merely
     * stops being *indexed*.
     */
    it('stores a body far past the tsvector limit and still indexes a prefix of it', async () => {
      expect(Buffer.byteLength(body)).toBeGreaterThan(2_000_000);
      await insert('huge', 'message', 'huge title', body);

      const { rows } = await pool.query<{ body_bytes: string; matches: boolean }>(
        `SELECT octet_length(body) AS body_bytes,
                search_vector @@ to_tsquery('simple', 'w0') AS matches
           FROM chat_search.documents WHERE record_id = 'huge'`,
      );
      expect(Number(rows[0].body_bytes)).toBe(Buffer.byteLength(body));
      expect(rows[0].matches).toBe(true);
    }, 60_000);

    /** The error the generated column raises once the bound is dropped. */
    it('would reject that body if the vector were built from the whole column', async () => {
      await expect(
        pool.query('SELECT to_tsvector($1::regconfig, $2::text)', ['simple', body]),
      ).rejects.toThrow(/too long for tsvector/);
    }, 60_000);

    it('stores a title wider than a B-tree index tuple and returns it in full', async () => {
      expect(Buffer.byteLength(title)).toBeGreaterThan(2704);
      await insert('wide', 'conversation', title, 'body');

      const { rows } = await pool.query<{ title: string }>(
        `SELECT title FROM chat_search.documents WHERE record_id = 'wide'`,
      );
      expect(rows[0].title).toBe(title);
    }, 60_000);

    it('serves a title-sorted page from the index without a sort step', async () => {
      await insert('narrow', 'conversation', 'a plain title', 'body');
      const client = await pool.connect();
      try {
        await client.query('SET enable_seqscan = off');
        const { rows } = await client.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN SELECT record_id FROM chat_search.documents
            WHERE tenant_id = 't1' AND user_id = 'u1' AND kind = 'conversation'
              AND deleted_at IS NULL
            ORDER BY left(title, 512), record_id
            LIMIT 20`,
        );
        const explained = rows.map((row) => row['QUERY PLAN']).join('\n');
        expect(explained).toContain('documents_scope_title_idx');
        expect(explained).not.toContain('Sort');
      } finally {
        client.release();
      }
    });
  });

  describe('keyset pagination over source timestamps', () => {
    beforeAll(async () => {
      await pool.query(
        `INSERT INTO chat_search.documents
           (tenant_id, user_id, kind, record_id, title, body, projection_version, source_updated_at)
         VALUES
           ('t2', 'u2', 'conversation', 'dated-a', 'a', 'b', 10, '2026-01-02T00:00:00Z'),
           ('t2', 'u2', 'conversation', 'dated-b', 'b', 'b', 11, '2026-01-01T00:00:00Z')`,
      );
      await pool.query(
        `INSERT INTO chat_search.documents
           (tenant_id, user_id, kind, record_id, title, body, projection_version)
         VALUES
           ('t2', 'u2', 'conversation', 'undated-a', 'c', 'b', 12),
           ('t2', 'u2', 'conversation', 'undated-b', 'd', 'b', 13)`,
      );
    });

    /**
     * `DESC` means `NULLS FIRST`, so a nullable sort column puts the
     * timestamp-less rows at the head of page one and makes the resume comparison
     * `(col, record_id) < (NULL, ...)` — NULL, which matches nothing. Walking every
     * page is what catches that; asking for page one alone is not.
     */
    it('reaches every row when some carry no source timestamp', async () => {
      const readPage = (from: Cursor | null) =>
        pool.query<PageRow>(
          `SELECT record_id, source_updated_at FROM chat_search.documents
            WHERE tenant_id = 't2' AND user_id = 'u2' AND kind = 'conversation'
              AND deleted_at IS NULL
              AND ($1::text IS NULL
                   OR (source_updated_at, record_id) < ($1::text::timestamptz, $2::text))
            ORDER BY source_updated_at DESC, record_id DESC
            LIMIT 2`,
          [from?.updatedAt ?? null, from?.recordId ?? null],
        );

      const seen: string[] = [];
      let cursor: Cursor | null = null;

      for (let page = 0; page < 4; page += 1) {
        const { rows } = await readPage(cursor);
        if (rows.length === 0) {
          break;
        }
        for (const row of rows) {
          seen.push(row.record_id);
        }
        const last = rows[rows.length - 1];
        cursor = { updatedAt: last.source_updated_at, recordId: last.record_id };
      }

      expect(seen).toEqual(['dated-a', 'dated-b', 'undated-b', 'undated-a']);
    });

    it('refuses a null source timestamp rather than letting one truncate a page', async () => {
      await expect(
        pool.query(
          `INSERT INTO chat_search.documents
             (tenant_id, user_id, kind, record_id, projection_version, source_updated_at)
           VALUES ('t2', 'u2', 'conversation', 'null-updated', 14, NULL)`,
        ),
      ).rejects.toThrow(/source_updated_at/);
      await expect(
        pool.query(
          `INSERT INTO chat_search.documents
             (tenant_id, user_id, kind, record_id, projection_version, source_created_at)
           VALUES ('t2', 'u2', 'conversation', 'null-created', 15, NULL)`,
        ),
      ).rejects.toThrow(/source_created_at/);
    });
  });

  /**
   * `search/init/chat-search-roles.sh` installs both extensions with
   * `SCHEMA chat_search`, and managed providers commonly use a dedicated
   * `extensions` schema. Operator classes and the `vector` type resolve through
   * `search_path` alone, so an unqualified reference aborts the migration there.
   */
  describe('extensions installed outside the default schema', () => {
    let extensionPool: SearchPool;

    beforeAll(async () => {
      extensionPool = await createIsolatedDatabase(EXTENSION_DB_NAME);
      await extensionPool.query('CREATE SCHEMA extensions');
      await extensionPool.query('CREATE EXTENSION vector SCHEMA extensions');
      await extensionPool.query('CREATE EXTENSION pg_trgm SCHEMA extensions');
    }, 60_000);

    afterAll(async () => {
      if (extensionPool) {
        await dropIsolatedDatabase(extensionPool, EXTENSION_DB_NAME);
      }
    });

    it('applies the schema migration and leaves search_path as it found it', async () => {
      const client = await extensionPool.connect();
      try {
        const { rows: before } = await client.query<{ search_path: string }>('SHOW search_path');
        await client.query('BEGIN');
        await client.query(schemaMigrationSql());
        await client.query('COMMIT');

        const { rows: after } = await client.query<{ search_path: string }>('SHOW search_path');
        expect(after[0].search_path).toBe(before[0].search_path);

        const { rows: indexes } = await client.query<{ indexname: string }>(
          `SELECT indexname FROM pg_indexes
            WHERE schemaname = 'chat_search'
              AND indexname IN ('documents_title_trgm_idx', 'embeddings_hnsw_cosine_idx')
            ORDER BY indexname`,
        );
        expect(indexes.map((row) => row.indexname)).toEqual([
          'documents_title_trgm_idx',
          'embeddings_hnsw_cosine_idx',
        ]);
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
    }, 60_000);
  });
});
