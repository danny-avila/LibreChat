import { createScope } from '@librechat/data-schemas';
import type { SearchClient, SearchPool } from './types';
import { describePg, dropIsolatedDatabase, migrateFresh } from './pg.helper';
import { scopeGucStatement } from './scope';
import { READER_ROLE } from './roles';
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

  it('scopes embeddings identically', async () => {
    await pool.query(
      `INSERT INTO chat_search.embeddings
         (tenant_id, user_id, kind, record_id, space, embedding_input_hash, model,
          dimensions, normalized, formatter_version, embedding)
       VALUES ('__BASE__','bob','message','m-b1','chat-v1','h','m',1024,true,'v1',$1::vector)
       ON CONFLICT DO NOTHING`,
      [`[${new Array(1024).fill(0.01).join(',')}]`],
    );
    const rows = await asReader(pool, async (client) => {
      await applyScope(client, createScope({ tenantId: '__BASE__', userId: 'alice' }));
      const result = await client.query('SELECT record_id FROM chat_search.embeddings');
      return result.rows;
    });
    expect(rows).toEqual([]);
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
    const forged = { tenantId: 'acme', userId: 'alice' } as unknown as Parameters<
      typeof applyScope
    >[1];
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
});
