import type { SearchPool } from './types';
import { findRoleViolations, OWNER_ROLE, READER_ROLE, WRITER_ROLE } from './roles';
import { describePg, dropIsolatedDatabase, migrateFresh } from './pg.helper';

const DB_NAME = 'privileges';

async function holds(
  pool: SearchPool,
  role: string,
  relation: string,
  privilege: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ held: boolean }>(
    'SELECT has_table_privilege($1, $2, $3) AS held',
    [role, `chat_search.${relation}`, privilege],
  );
  return rows[0].held;
}

/**
 * `poll_cursor` is created two migrations after the one that hands out grants, so
 * it is the standing proof that a later migration inherits the right ones without
 * carrying a grant list of its own. The next table added to this schema is the
 * case that matters, and it will pass or fail here without anyone editing these
 * expectations.
 */
describePg('chat_search privileges on a later migration’s table', () => {
  let pool: SearchPool;

  beforeAll(async () => {
    pool = await migrateFresh(DB_NAME);
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await dropIsolatedDatabase(pool, DB_NAME);
    }
  });

  it('gives the writer full DML without that migration granting it', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(await holds(pool, WRITER_ROLE, 'poll_cursor', privilege)).toBe(true);
    }
  });

  it('gives the reader nothing, without that migration revoking it', async () => {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(await holds(pool, READER_ROLE, 'poll_cursor', privilege)).toBe(false);
    }
    await expect(findRoleViolations(pool)).resolves.toEqual([]);
  });

  it('hands it to the migration owner, so the gate has an owner to recognise', async () => {
    const { rows } = await pool.query<{ owner: string }>(
      "SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid = 'chat_search.poll_cursor'::regclass",
    );
    expect(rows[0].owner).toBe(OWNER_ROLE);
  });

  /**
   * A view over `documents` is a readable copy of `documents`, and neither a view
   * nor a materialized view appears in `pg_tables` at all — so a gate built on
   * that catalog reports a clean schema while the reader reads every row in it.
   * Sequences are invisible there too, and the reader is revoked on them by name
   * in the same migration that revokes the tables.
   */
  describe('relation kinds the reader must not reach', () => {
    beforeAll(async () => {
      await pool.query('CREATE VIEW chat_search.probe_view AS SELECT * FROM chat_search.documents');
      await pool.query(
        'CREATE MATERIALIZED VIEW chat_search.probe_matview AS SELECT * FROM chat_search.documents',
      );
      await pool.query('CREATE SEQUENCE chat_search.probe_seq');
      await pool.query(`ALTER VIEW chat_search.probe_view OWNER TO ${OWNER_ROLE}`);
      await pool.query(`ALTER MATERIALIZED VIEW chat_search.probe_matview OWNER TO ${OWNER_ROLE}`);
      await pool.query(`ALTER SEQUENCE chat_search.probe_seq OWNER TO ${OWNER_ROLE}`);
    });

    afterAll(async () => {
      await pool.query('DROP VIEW IF EXISTS chat_search.probe_view');
      await pool.query('DROP MATERIALIZED VIEW IF EXISTS chat_search.probe_matview');
      await pool.query('DROP SEQUENCE IF EXISTS chat_search.probe_seq');
    });

    afterEach(async () => {
      await pool.query(
        `REVOKE ALL ON chat_search.probe_view, chat_search.probe_matview FROM ${READER_ROLE}, PUBLIC`,
      );
      await pool.query(`REVOKE ALL ON SEQUENCE chat_search.probe_seq FROM ${READER_ROLE}, PUBLIC`);
      await pool.query(`REVOKE ALL ON chat_search.documents FROM PUBLIC`);
    });

    it('is clean before anything is granted', async () => {
      await expect(findRoleViolations(pool)).resolves.toEqual([]);
    });

    it('catches a grant on a view', async () => {
      await pool.query(`GRANT SELECT ON chat_search.probe_view TO ${READER_ROLE}`);
      await expect(findRoleViolations(pool)).resolves.toEqual([
        { role: READER_ROLE, problem: 'has SELECT on chat_search.probe_view' },
      ]);
    });

    it('catches a grant on a materialized view', async () => {
      await pool.query(`GRANT SELECT ON chat_search.probe_matview TO ${READER_ROLE}`);
      await expect(findRoleViolations(pool)).resolves.toEqual([
        { role: READER_ROLE, problem: 'has SELECT on chat_search.probe_matview' },
      ]);
    });

    it('catches a grant on a sequence', async () => {
      await pool.query(`GRANT USAGE ON SEQUENCE chat_search.probe_seq TO ${READER_ROLE}`);
      await expect(findRoleViolations(pool)).resolves.toEqual([
        { role: READER_ROLE, problem: 'has USAGE on chat_search.probe_seq' },
      ]);
    });

    /**
     * The reader needs no grant of its own to read a relation granted to PUBLIC,
     * which is the shape a default privilege declared without `IN SCHEMA` leaves
     * behind — the one case the migration provably cannot close.
     */
    it('catches a PUBLIC grant on a serving table the reader may only read', async () => {
      await pool.query('GRANT INSERT ON chat_search.documents TO PUBLIC');
      await expect(findRoleViolations(pool)).resolves.toEqual([
        { role: 'PUBLIC', problem: 'has INSERT on chat_search.documents' },
      ]);
    });

    it('catches a PUBLIC SELECT on a serving table, which the reader alone may hold', async () => {
      await pool.query('GRANT SELECT ON chat_search.documents TO PUBLIC');
      await expect(findRoleViolations(pool)).resolves.toEqual([
        { role: 'PUBLIC', problem: 'has SELECT on chat_search.documents' },
      ]);
    });
  });
});
