import { createScope } from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
import type { SearchPool } from './types';
import { describePg, dropIsolatedDatabase, migrateFresh } from './pg.helper';
import { decodeCursor, encodeCursor, hashQuery } from './cursor';
import { PostgresChatSearch } from './search';

const DB_NAME = 'search';
const SECRET = 'test-cursor-secret';

const ALICE = createScope({ tenantId: 'tenant-a', userId: 'user-1' });
const BOB = createScope({ tenantId: 'tenant-b', userId: 'user-1' });

const vector = (fill: number) => `[${new Array(1024).fill(fill).join(',')}]`;

describePg('PostgresChatSearch', () => {
  let pool: SearchPool;
  let scope: Scope = ALICE;

  const search = () =>
    new PostgresChatSearch({ pool, resolveScope: () => scope, cursorSecret: SECRET });

  beforeAll(async () => {
    pool = await migrateFresh(DB_NAME);

    for (const owner of [ALICE, BOB]) {
      for (let index = 0; index < 12; index++) {
        await pool.query(
          `INSERT INTO chat_search.documents
             (tenant_id, user_id, kind, record_id, conversation_id, title, body,
              projection_version, embedding_input_hash)
           VALUES ($1, $2, 'message', $3, $4, $5, $6, 1, 'h1')`,
          [
            owner.tenantId,
            owner.userId,
            `rec-${index}`,
            `convo-${owner.tenantId}`,
            `quarterly report ${index}`,
            `quarterly revenue detail number ${index}`,
          ],
        );
      }
    }
  }, 120_000);

  afterAll(async () => {
    if (pool) {
      await dropIsolatedDatabase(pool, DB_NAME);
    }
  });

  beforeEach(() => {
    scope = ALICE;
  });

  it('reports readiness against the live database', async () => {
    await expect(search().isReady()).resolves.toBe(true);
  });

  it('returns candidate ids and scores only, never stored text', async () => {
    const result = await search().search({
      target: 'messages',
      scope: ALICE,
      query: 'quarterly',
      limit: 5,
    });

    expect(result.hits.length).toBe(5);
    for (const hit of result.hits) {
      expect(Object.keys(hit).sort()).toEqual(['conversationId', 'recordId', 'score', 'source']);
    }
  });

  it('returns only the requesting principal rows', async () => {
    const result = await search().search({
      target: 'messages',
      scope: ALICE,
      query: 'quarterly',
      limit: 20,
    });
    for (const hit of result.hits) {
      expect(hit.conversationId).toBe('convo-tenant-a');
    }
  });

  it('ignores the scope on the request and uses the resolved one', async () => {
    /** An adapter passing a foreign scope must not widen anything. */
    const result = await search().search({
      target: 'messages',
      scope: BOB,
      query: 'quarterly',
      limit: 20,
    });
    for (const hit of result.hits) {
      expect(hit.conversationId).toBe('convo-tenant-a');
    }
  });

  it('serves nothing for a query below the minimum length', async () => {
    const result = await search().search({
      target: 'messages',
      scope: ALICE,
      query: 'ab',
      limit: 5,
    });
    expect(result.hits).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  describe('snapshot pagination', () => {
    it('pages through a frozen list without repeating or dropping a record', async () => {
      const chat = search();
      const seen: string[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < 5; page++) {
        const result = await chat.search({
          target: 'messages',
          scope: ALICE,
          query: 'quarterly',
          limit: 5,
          cursor,
        });
        seen.push(...result.hits.map((hit) => hit.recordId));
        if (!result.nextCursor) {
          break;
        }
        cursor = result.nextCursor;
      }

      expect(seen).toHaveLength(12);
      expect(new Set(seen).size).toBe(12);
    });

    it('ends with a null cursor once the snapshot is exhausted', async () => {
      const chat = search();
      let cursor: string | undefined;
      let last = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
      });
      while (last.nextCursor) {
        cursor = last.nextCursor;
        last = await chat.search({
          target: 'messages',
          scope: ALICE,
          query: 'quarterly',
          limit: 5,
          cursor,
        });
      }
      expect(last.nextCursor).toBeNull();
    });

    /**
     * The gate: a cursor minted by one principal must not read another's
     * snapshot, even though its signature is perfectly valid.
     */
    it('rejects a cursor minted under another principal', async () => {
      const chat = search();
      const first = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
      });
      expect(first.nextCursor).not.toBeNull();

      scope = BOB;
      const stolen = await chat.search({
        target: 'messages',
        scope: BOB,
        query: 'quarterly',
        limit: 5,
        cursor: first.nextCursor!,
      });

      /** Re-run under Bob's own scope rather than served from Alice's snapshot. */
      for (const hit of stolen.hits) {
        expect(hit.conversationId).toBe('convo-tenant-b');
      }
    });

    it('re-runs rather than erroring when the snapshot is gone', async () => {
      const chat = search();
      const forged = encodeCursor(
        {
          v: 1,
          snapshotId: 'does-not-exist',
          offset: 5,
          queryHash: hashQuery('quarterly', 'messages'),
        },
        SECRET,
      );

      const result = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
        cursor: forged,
      });

      expect(result.hits.length).toBe(5);
      expect(result.nextCursor).not.toBeNull();
    });

    it('restarts on a tampered signature instead of honouring it', async () => {
      const chat = search();
      const first = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
      });
      const tampered = `${first.nextCursor!.split('.')[0]}.deadbeef`;

      const result = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
        cursor: tampered,
      });

      expect(result.hits.length).toBe(5);
      for (const hit of result.hits) {
        expect(hit.conversationId).toBe('convo-tenant-a');
      }
    });

    it('re-runs when the query changed under a reused cursor', async () => {
      const chat = search();
      const first = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
      });

      const result = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'revenue',
        limit: 5,
        cursor: first.nextCursor!,
      });

      expect(result.hits.length).toBeGreaterThan(0);
    });

    /** Rejects, expiries and deletions are applied per page, not once. */
    it('drops a record tombstoned after the snapshot was taken', async () => {
      const chat = search();
      const first = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
      });
      const doomed = first.hits[0].recordId;

      await pool.query(
        `UPDATE chat_search.documents SET deleted_at = now()
          WHERE tenant_id = $1 AND user_id = $2 AND kind = 'message' AND record_id = $3`,
        [ALICE.tenantId, ALICE.userId, doomed],
      );

      const second = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
        cursor: first.nextCursor!,
      });

      expect(second.hits.map((hit) => hit.recordId)).not.toContain(doomed);

      await pool.query(
        `UPDATE chat_search.documents SET deleted_at = NULL
          WHERE tenant_id = $1 AND user_id = $2 AND kind = 'message' AND record_id = $3`,
        [ALICE.tenantId, ALICE.userId, doomed],
      );
    });
  });

  describe('degradation', () => {
    it('reports embedding-unavailable but still serves lexical results', async () => {
      const chat = new PostgresChatSearch({
        pool,
        resolveScope: () => scope,
        cursorSecret: SECRET,
        embedder: {
          embed: async () => {
            throw new Error('gateway down');
          },
        },
      });

      const result = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 5,
      });

      expect(result.degradations).toContain('embedding-unavailable');
      expect(result.hits.length).toBe(5);
      for (const hit of result.hits) {
        expect(hit.conversationId).toBe('convo-tenant-a');
      }
    });

    it('merges the vector arm when an embedding is available', async () => {
      for (const owner of [ALICE, BOB]) {
        await pool.query(
          `INSERT INTO chat_search.embeddings
             (tenant_id, user_id, kind, record_id, space, embedding_input_hash, model,
              dimensions, normalized, formatter_version, embedding)
           VALUES ($1, $2, 'message', 'rec-0', 'chat-v1', 'h1', 'm', 1024, true, 'v1', $3::vector)
           ON CONFLICT DO NOTHING`,
          [owner.tenantId, owner.userId, vector(0.03125)],
        );
      }

      const chat = new PostgresChatSearch({
        pool,
        resolveScope: () => scope,
        cursorSecret: SECRET,
        embedder: { embed: async () => new Array(1024).fill(0.03125) },
      });

      const result = await chat.search({
        target: 'messages',
        scope: ALICE,
        query: 'quarterly',
        limit: 20,
      });

      expect(result.degradations).toEqual([]);
      for (const hit of result.hits) {
        expect(hit.conversationId).toBe('convo-tenant-a');
      }
    });
  });
});

describe('cursor codec', () => {
  it('round-trips a signed payload', () => {
    const token = encodeCursor({ v: 1, snapshotId: 's1', offset: 5, queryHash: 'q' }, SECRET);
    const decoded = decodeCursor(token, SECRET);
    expect(decoded).toEqual({
      status: 'ok',
      payload: { v: 1, snapshotId: 's1', offset: 5, queryHash: 'q' },
    });
  });

  it('never carries tenant or user scope', () => {
    const token = encodeCursor({ v: 1, snapshotId: 's1', offset: 5, queryHash: 'q' }, SECRET);
    const body = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
    expect(body).not.toMatch(/tenant/i);
    expect(body).not.toMatch(/user/i);
  });

  it('restarts on a foreign signing key', () => {
    const token = encodeCursor({ v: 1, snapshotId: 's1', offset: 5, queryHash: 'q' }, 'other-key');
    expect(decodeCursor(token, SECRET).status).toBe('restart');
  });

  it('restarts on an unversioned legacy cursor rather than failing', () => {
    const legacy = Buffer.from(JSON.stringify({ primary: 'x' })).toString('base64');
    expect(decodeCursor(legacy, SECRET).status).toBe('restart');
  });

  it('restarts on a future cursor version', () => {
    const token = encodeCursor(
      { v: 99, snapshotId: 's1', offset: 0, queryHash: 'q' } as never,
      SECRET,
    );
    expect(decodeCursor(token, SECRET).status).toBe('restart');
  });

  it('treats an absent cursor as page one', () => {
    expect(decodeCursor(undefined, SECRET).status).toBe('absent');
  });
});

describe('cursor signing configuration', () => {
  const OLD_ENV = process.env;
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('refuses to construct without an operator-supplied secret', () => {
    process.env = { ...OLD_ENV };
    delete process.env.CHAT_SEARCH_CURSOR_SECRET;
    expect(
      () =>
        new PostgresChatSearch({
          pool: null as never,
          resolveScope: () => ALICE,
        }),
    ).toThrow(/CHAT_SEARCH_CURSOR_SECRET is required/);
  });
});
