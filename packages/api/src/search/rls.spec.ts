import { randomBytes } from 'crypto';
import { createScope } from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
import type { SearchClient, SearchPool } from './types';
import { describePg, dropIsolatedDatabase, migrateFresh } from './pg.helper';
import { findRoleViolations, READER_ROLE } from './roles';
import { scopeGucStatement } from './scope';
import { applyScope } from './pool';

const SEED = `
  INSERT INTO chat_search.documents
    (tenant_id, user_id, kind, record_id, conversation_id, title, body, projection_version)
  VALUES
    ('__BASE__', 'alice', 'message', 'm-a1', 'c-a', 'alpha report', 'alpha body', 1),
    ('__BASE__', 'bob',   'message', 'm-b1', 'c-b', 'alpha report', 'alpha body', 2),
    ('acme',     'alice', 'message', 'm-c1', 'c-c', 'alpha report', 'alpha body', 3),
    ('__SYSTEM__','alice','message', 'm-s1', 'c-s', 'alpha report', 'alpha body', 4)
  ON CONFLICT DO NOTHING;
`;

async function asReader<T>(pool: SearchPool, fn: (client: SearchClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${READER_ROLE}`);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

const DB_NAME = 'rls';

describePg('chat_search row level security', () => {
  let pool: SearchPool;

  beforeAll(async () => {
    pool = await migrateFresh(DB_NAME);
    await pool.query(SEED);
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await dropIsolatedDatabase(pool, DB_NAME);
    }
  });

  it('returns zero rows when no scope GUC is set', async () => {
    const rows = await asReader(pool, async (client) => {
      const result = await client.query('SELECT record_id FROM chat_search.documents');
      return result.rows;
    });
    expect(rows).toEqual([]);
  });

  it('returns only the scoped tenant and user', async () => {
    const rows = await asReader(pool, async (client) => {
      await applyScope(client, createScope({ tenantId: '__BASE__', userId: 'alice' }));
      const result = await client.query<{ record_id: string }>(
        'SELECT record_id FROM chat_search.documents ORDER BY record_id',
      );
      return result.rows.map((r) => r.record_id);
    });
    expect(rows).toEqual(['m-a1']);
  });

  it('does not leak across users inside one tenant', async () => {
    const rows = await asReader(pool, async (client) => {
      await applyScope(client, createScope({ tenantId: '__BASE__', userId: 'bob' }));
      const result = await client.query<{ record_id: string }>(
        'SELECT record_id FROM chat_search.documents ORDER BY record_id',
      );
      return result.rows.map((r) => r.record_id);
    });
    expect(rows).toEqual(['m-b1']);
  });

  it('does not leak across tenants for the same user id', async () => {
    const rows = await asReader(pool, async (client) => {
      await applyScope(client, createScope({ tenantId: 'acme', userId: 'alice' }));
      const result = await client.query<{ record_id: string }>(
        'SELECT record_id FROM chat_search.documents ORDER BY record_id',
      );
      return result.rows.map((r) => r.record_id);
    });
    expect(rows).toEqual(['m-c1']);
  });

  it('treats the system sentinel as an ordinary literal, never a wildcard', async () => {
    /**
     * `createScope` refuses to mint this scope, so the GUCs are set raw here on
     * purpose: the assertion is about the *policy*, which must never special-case
     * `__SYSTEM__` even if some future caller bypasses the application gate. Two
     * independent defences, tested independently.
     */
    const rows = await asReader(pool, async (client) => {
      await client.query('SELECT set_config($1, $2, true), set_config($3, $4, true)', [
        'chat_search.tenant_id',
        '__SYSTEM__',
        'chat_search.user_id',
        'alice',
      ]);
      const result = await client.query<{ record_id: string }>(
        'SELECT record_id FROM chat_search.documents ORDER BY record_id',
      );
      return result.rows.map((r) => r.record_id);
    });
    expect(rows).toEqual(['m-s1']);
  });

  /**
   * Every embeddings assertion below needs the positive half. Forced RLS plus a
   * bare SELECT grant makes "sees nothing" the default outcome, so an absent-rows
   * expectation on its own passes just as happily against a deleted policy or one
   * rewritten `USING (false)`. Seeing the right rows is what distinguishes a
   * scoped policy from no policy at all.
   */
  describe('embeddings', () => {
    beforeAll(async () => {
      const embedding = `[${new Array(1024).fill(0.01).join(',')}]`;
      await pool.query(
        `INSERT INTO chat_search.embeddings
           (tenant_id, user_id, kind, record_id, space, embedding_input_hash, model,
            dimensions, normalized, formatter_version, embedding)
         VALUES
           ('__BASE__','alice','message','m-a1','chat-v1','h','m',1024,true,'v1',$1::vector),
           ('__BASE__','bob',  'message','m-b1','chat-v1','h','m',1024,true,'v1',$1::vector),
           ('acme',    'alice','message','m-c1','chat-v1','h','m',1024,true,'v1',$1::vector)
         ON CONFLICT DO NOTHING`,
        [embedding],
      );
    });

    const readAs = (tenantId: string, userId: string): Promise<string[]> =>
      asReader(pool, async (client) => {
        await applyScope(client, createScope({ tenantId, userId }));
        const result = await client.query<{ record_id: string }>(
          'SELECT record_id FROM chat_search.embeddings ORDER BY record_id',
        );
        return result.rows.map((r) => r.record_id);
      });

    it('returns the scoped rows and only those, on both axes', async () => {
      expect(await readAs('__BASE__', 'alice')).toEqual(['m-a1']);
      expect(await readAs('__BASE__', 'bob')).toEqual(['m-b1']);
      expect(await readAs('acme', 'alice')).toEqual(['m-c1']);
    });

    it('returns zero rows when no scope GUC is set', async () => {
      const rows = await asReader(pool, async (client) => {
        const result = await client.query('SELECT record_id FROM chat_search.embeddings');
        return result.rows;
      });
      expect(rows).toEqual([]);
    });
  });

  it('does not carry scope across transactions on a pooled connection', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${READER_ROLE}`);
      await applyScope(client, createScope({ tenantId: '__BASE__', userId: 'alice' }));
      await client.query('COMMIT');

      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${READER_ROLE}`);
      const result = await client.query('SELECT record_id FROM chat_search.documents');
      await client.query('ROLLBACK');
      expect(result.rows).toEqual([]);
    } finally {
      client.release();
    }
  });

  it('cannot be handed an unbranded scope object at all', () => {
    /**
     * The compiler rejects this at the call site; the runtime gate is what
     * protects a JavaScript caller and a bad `as` cast.
     */
    const forged = { tenantId: 'acme', userId: 'alice' } as Scope;
    expect(() => scopeGucStatement(forged)).toThrow(/no Scope supplied/);
  });

  it('refuses to build a scope with an empty user', () => {
    expect(() => createScope({ tenantId: 'acme', userId: '' })).toThrow(/userId is missing/);
  });

  it('refuses to build a scope naming the system tenant', () => {
    expect(() => createScope({ tenantId: '__SYSTEM__', userId: 'alice' })).toThrow(
      /query-time wildcard/,
    );
  });

  /**
   * The gate has to catch a table nobody thought to enumerate, because the tables
   * it must catch are the ones a future migration adds. Each case grants the
   * reader something and expects the gate to name it.
   */
  describe('reader privilege derivation', () => {
    afterEach(async () => {
      await pool.query('DROP TABLE IF EXISTS chat_search.gate_probe');
      await pool.query(`REVOKE ALL ON chat_search.poll_cursor FROM ${READER_ROLE}`);
    });

    it('starts from a clean gate', async () => {
      await expect(findRoleViolations(pool)).resolves.toEqual([]);
    });

    it('catches a grant on the poll cursor', async () => {
      await pool.query(`GRANT SELECT ON chat_search.poll_cursor TO ${READER_ROLE}`);
      await expect(findRoleViolations(pool)).resolves.toEqual([
        { role: READER_ROLE, problem: 'has SELECT on chat_search.poll_cursor' },
      ]);
    });

    it('catches a grant on a table added after the gate was written', async () => {
      await pool.query('CREATE TABLE chat_search.gate_probe (id text PRIMARY KEY)');
      await pool.query('ALTER TABLE chat_search.gate_probe OWNER TO chat_search_owner');
      await pool.query(`GRANT SELECT, UPDATE ON chat_search.gate_probe TO ${READER_ROLE}`);
      await expect(findRoleViolations(pool)).resolves.toEqual([
        { role: READER_ROLE, problem: 'has SELECT on chat_search.gate_probe' },
        { role: READER_ROLE, problem: 'has UPDATE on chat_search.gate_probe' },
      ]);
    });

    it('catches a write grant on a serving table the reader may only read', async () => {
      await pool.query(`GRANT INSERT ON chat_search.documents TO ${READER_ROLE}`);
      try {
        await expect(findRoleViolations(pool)).resolves.toEqual([
          { role: READER_ROLE, problem: 'has INSERT on chat_search.documents' },
        ]);
      } finally {
        await pool.query(`REVOKE INSERT ON chat_search.documents FROM ${READER_ROLE}`);
      }
    });
  });

  /**
   * Attribute drift is audited on a throwaway role, never on the managed trio:
   * role attributes are cluster-global, and flipping CREATEROLE on the real
   * reader would race every parallel suite's clean-gate assertion. The
   * throwaway proves the query catches each drifted attribute; the clean-gate
   * test above proves the default audit covers the managed names.
   */
  describe('role attribute drift', () => {
    const DRIFT_ROLE = `chat_search_test_drift_${randomBytes(4).toString('hex')}`;

    afterEach(async () => {
      await pool.query(`DROP ROLE IF EXISTS ${DRIFT_ROLE}`);
    });

    it('catches CREATEROLE, whose holder could rotate the writer password', async () => {
      await pool.query(`CREATE ROLE ${DRIFT_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE`);
      await expect(findRoleViolations(pool, [DRIFT_ROLE])).resolves.toEqual([
        { role: DRIFT_ROLE, problem: 'has CREATEROLE' },
      ]);
    });

    it('catches CREATEDB', async () => {
      await pool.query(`CREATE ROLE ${DRIFT_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS CREATEDB`);
      await expect(findRoleViolations(pool, [DRIFT_ROLE])).resolves.toEqual([
        { role: DRIFT_ROLE, problem: 'has CREATEDB' },
      ]);
    });

    it('catches a role stripped of LOGIN', async () => {
      await pool.query(`CREATE ROLE ${DRIFT_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      await expect(findRoleViolations(pool, [DRIFT_ROLE])).resolves.toEqual([
        { role: DRIFT_ROLE, problem: 'cannot LOGIN' },
      ]);
    });
  });

  /**
   * Permissive policies combine with OR, so the flags alone prove nothing: a
   * table can have RLS enabled, forced, and a second policy that hands every
   * row to PUBLIC. The gate has to read `pg_policy` itself — these three are
   * the drift shapes it must catch, each restored to the migrated state after.
   */
  describe('policy audit', () => {
    it('audits the live policy set, not just the RLS flags', async () => {
      await pool.query(
        'CREATE POLICY gate_probe_leak ON chat_search.documents FOR SELECT TO PUBLIC USING (true)',
      );
      try {
        await expect(findRoleViolations(pool)).resolves.toEqual([
          {
            role: 'PUBLIC',
            problem:
              'is reachable through unexpected policy gate_probe_leak on chat_search.documents',
          },
        ]);
      } finally {
        await pool.query('DROP POLICY gate_probe_leak ON chat_search.documents');
      }
    });

    it('catches an expected policy whose predicate was rewritten', async () => {
      await pool.query('DROP POLICY documents_reader_scope ON chat_search.documents');
      await pool.query(
        `CREATE POLICY documents_reader_scope ON chat_search.documents
           FOR SELECT TO ${READER_ROLE} USING (true)`,
      );
      try {
        await expect(findRoleViolations(pool)).resolves.toEqual([
          {
            role: 'chat_search_owner',
            problem: expect.stringContaining(
              'policy documents.documents_reader_scope has USING true',
            ),
          },
        ]);
      } finally {
        await pool.query('DROP POLICY documents_reader_scope ON chat_search.documents');
        await pool.query(
          `CREATE POLICY documents_reader_scope ON chat_search.documents
             FOR SELECT TO ${READER_ROLE}
             USING (
               tenant_id = nullif(current_setting('chat_search.tenant_id', true), '')
               AND user_id = nullif(current_setting('chat_search.user_id', true), '')
             )`,
        );
      }
    });

    it('catches a dropped policy', async () => {
      await pool.query('DROP POLICY embeddings_writer_all ON chat_search.embeddings');
      try {
        await expect(findRoleViolations(pool)).resolves.toEqual([
          {
            role: 'chat_search_owner',
            problem: 'policy embeddings.embeddings_writer_all is missing',
          },
        ]);
      } finally {
        await pool.query(
          `CREATE POLICY embeddings_writer_all ON chat_search.embeddings
             FOR ALL TO chat_search_writer USING (true) WITH CHECK (true)`,
        );
      }
    });
  });
});
