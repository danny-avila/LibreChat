import { createScope, runAsSystem, tenantStorage } from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
import type { SearchClient, SearchKind, SearchPool } from './types';
import type { ArmName, ArmQuery } from './arms';
import {
  buildExactArm,
  buildFtsArm,
  buildTrigramArm,
  buildVectorArm,
  runLexicalArms,
} from './arms';
import { describePg, dropIsolatedDatabase, migrateFresh } from './pg.helper';
import { assertScopedQuery, scopedQuery } from './scope';
import { applyScope, withTransaction } from './pool';
import { resolveScope } from './scope';
import { READER_ROLE } from './roles';
import { fuseByRrf } from './fusion';

/**
 * LEAK MATRIX — PostgreSQL half.
 *
 * {exact, trigram, FTS, vector} x {messages, conversations, shared-links},
 * seeded with two users in two tenants sharing **identical record ids, identical
 * bodies and identical vectors**, so nothing but the scope predicate can
 * separate them. Each row's `conversation_id` is the only distinguishing field,
 * and it is what every assertion checks — a leak is therefore visible rather
 * than merely possible.
 *
 * Both defences are exercised independently, because they protect against
 * different failures:
 *
 *  - the arm's explicit predicate, tested with RLS out of the picture (the test
 *    role bypasses it), which is what keeps the scoped indexes usable and what a
 *    reviewer reads;
 *  - RLS, tested with a deliberately *unscoped* query run as the request reader,
 *    which is what saves a future arm that forgets.
 *
 * An arm that forgets scope fails here by construction rather than by reviewer
 * attention.
 */
const DB_NAME = 'leakmatrix';

const KINDS: readonly SearchKind[] = ['message', 'conversation', 'shared-link'];

/** Same user id in two tenants, and two user ids in one tenant. */
type Principal = Readonly<{ name: string; tenantId: string; userId: string }>;

const ALICE: Principal = { name: 'alice', tenantId: 'tenant-a', userId: 'user-1' };
const BOB: Principal = { name: 'bob', tenantId: 'tenant-b', userId: 'user-1' };
const CAROL: Principal = { name: 'carol', tenantId: 'tenant-a', userId: 'user-2' };
const PRINCIPALS: readonly Principal[] = [ALICE, BOB, CAROL];

/** Identical in every cell, so only the scope predicate can separate results. */
const COLLIDING_RECORD_ID = 'shared-record-id';
const COLLIDING_TITLE = 'quarterly revenue projection';
const COLLIDING_BODY = 'quarterly revenue projection for the northern region';

const scopeOf = (principal: Principal): Scope =>
  createScope({ tenantId: principal.tenantId, userId: principal.userId });

/** The marker that proves which principal's row came back. */
const conversationOf = (principal: Principal, kind: SearchKind): string =>
  `convo-${principal.name}-${kind}`;

function collidingVector(): string {
  return `[${new Array(1024).fill(0.03125).join(',')}]`;
}

describePg('leak matrix (PostgreSQL)', () => {
  let pool: SearchPool;

  beforeAll(async () => {
    pool = await migrateFresh(DB_NAME);

    for (const principal of PRINCIPALS) {
      for (const kind of KINDS) {
        await pool.query(
          `INSERT INTO chat_search.documents
             (tenant_id, user_id, kind, record_id, conversation_id, title, body,
              projection_version, embedding_input_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'h1')`,
          [
            principal.tenantId,
            principal.userId,
            kind,
            COLLIDING_RECORD_ID,
            conversationOf(principal, kind),
            COLLIDING_TITLE,
            COLLIDING_BODY,
          ],
        );
        await pool.query(
          `INSERT INTO chat_search.embeddings
             (tenant_id, user_id, kind, record_id, space, embedding_input_hash, model,
              dimensions, normalized, formatter_version, embedding)
           VALUES ($1, $2, $3, $4, 'chat-v1', 'h1', 'test-model', 1024, true, 'v1', $5::vector)`,
          [principal.tenantId, principal.userId, kind, COLLIDING_RECORD_ID, collidingVector()],
        );
      }
    }
  }, 120_000);

  afterAll(async () => {
    if (pool) {
      await dropIsolatedDatabase(pool, DB_NAME);
    }
  });

  const armBuilders: Readonly<
    Record<ArmName, (principal: Principal, kind: SearchKind) => ArmQuery>
  > = {
    exact: (principal, kind) =>
      buildExactArm(scopedQuery(scopeOf(principal), kind), COLLIDING_TITLE),
    trigram: (principal, kind) =>
      buildTrigramArm(scopedQuery(scopeOf(principal), kind), COLLIDING_TITLE),
    fts: (principal, kind) => buildFtsArm(scopedQuery(scopeOf(principal), kind), 'revenue'),
    vector: (principal, kind) =>
      buildVectorArm(
        scopedQuery(scopeOf(principal), kind),
        new Array(1024).fill(0.03125),
        'chat-v1',
      ),
  };

  /** Same arms, but taking the ScopedQuery directly so a forgery can be passed. */
  const rawArmBuilders: Readonly<
    Record<ArmName, (scoped: ReturnType<typeof scopedQuery>) => ArmQuery>
  > = {
    exact: (scoped) => buildExactArm(scoped, COLLIDING_TITLE),
    trigram: (scoped) => buildTrigramArm(scoped, COLLIDING_TITLE),
    fts: (scoped) => buildFtsArm(scoped, 'revenue'),
    vector: (scoped) => buildVectorArm(scoped, new Array(1024).fill(0.03125), 'chat-v1'),
  };

  const ARM_NAMES = Object.keys(armBuilders) as ArmName[];

  describe.each(ARM_NAMES)('%s arm', (arm) => {
    describe.each(KINDS)('%s', (kind) => {
      it.each(PRINCIPALS.map((p) => [p.name, p] as const))(
        'returns only %s own row',
        async (_name, principal) => {
          const query = armBuilders[arm](principal, kind);
          const { rows } = await pool.query<{ conversation_id: string }>(query.text, [
            ...query.values,
          ]);

          expect(rows).toHaveLength(1);
          expect(rows[0].conversation_id).toBe(conversationOf(principal, kind));
        },
      );

      it('never returns another principal conversation id', async () => {
        const foreign = new Set(
          PRINCIPALS.filter((p) => p !== ALICE).map((p) => conversationOf(p, kind)),
        );
        const query = armBuilders[arm](ALICE, kind);
        const { rows } = await pool.query<{ conversation_id: string }>(query.text, [
          ...query.values,
        ]);

        for (const row of rows) {
          expect(foreign.has(row.conversation_id)).toBe(false);
        }
      });

      it('never returns another kind row', async () => {
        const query = armBuilders[arm](ALICE, kind);
        const { rows } = await pool.query<{ conversation_id: string }>(query.text, [
          ...query.values,
        ]);
        for (const row of rows) {
          expect(row.conversation_id.endsWith(kind)).toBe(true);
        }
      });
    });
  });

  /**
   * RLS on its own, with the arm predicate deliberately removed. This is the net
   * under a future arm that forgets — the query below is exactly the mistake
   * being guarded against.
   */
  describe.each(KINDS)('row level security alone (%s)', (kind) => {
    it.each(PRINCIPALS.map((p) => [p.name, p] as const))(
      'confines an unscoped query to %s own row',
      async (_name, principal) => {
        const rows = await asReader(pool, scopeOf(principal), async (client) => {
          const result = await client.query<{ conversation_id: string }>(
            'SELECT conversation_id FROM chat_search.documents WHERE kind = $1',
            [kind],
          );
          return result.rows;
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].conversation_id).toBe(conversationOf(principal, kind));
      },
    );

    it('confines an unscoped embeddings join too', async () => {
      const rows = await asReader(pool, scopeOf(ALICE), async (client) => {
        const result = await client.query<{ conversation_id: string }>(
          `SELECT d.conversation_id
             FROM chat_search.documents d
             JOIN chat_search.embeddings e ON e.record_id = d.record_id
            WHERE d.kind = $1`,
          [kind],
        );
        return result.rows;
      });
      for (const row of rows) {
        expect(row.conversation_id).toBe(conversationOf(ALICE, kind));
      }
    });
  });

  describe('fusion', () => {
    it('never mixes principals when arms are fused', async () => {
      const fused = await withTransaction(pool, async (client) => {
        const scoped = scopedQuery(scopeOf(ALICE), 'message');
        const arms = await runLexicalArms(client, scoped, COLLIDING_TITLE);
        return fuseByRrf([
          { name: 'exact', source: 'postgres', candidates: arms.exact },
          { name: 'trigram', source: 'postgres', candidates: arms.trigram },
          { name: 'fts', source: 'postgres', candidates: arms.fts },
        ]);
      });

      expect(fused.length).toBeGreaterThan(0);
      for (const hit of fused) {
        expect(hit.conversationId).toBe(conversationOf(ALICE, 'message'));
      }
    });

    /** Degradation must narrow what is served, never widen who can see it. */
    it('keeps scope when only the lexical arms are available', async () => {
      const fused = await withTransaction(pool, async (client) => {
        const scoped = scopedQuery(scopeOf(CAROL), 'message');
        const arms = await runLexicalArms(client, scoped, COLLIDING_TITLE);
        return fuseByRrf([{ name: 'exact', source: 'postgres', candidates: arms.exact }]);
      });

      expect(fused).toHaveLength(1);
      expect(fused[0].conversationId).toBe(conversationOf(CAROL, 'message'));
    });
  });

  describe('scope resolution', () => {
    it('rejects a search invoked in a background system context', async () => {
      await tenantStorage.run({ tenantId: 'tenant-a', userId: 'user-1' }, async () => {
        await runAsSystem(async () => {
          expect(() => resolveScope()).toThrow(/query-time wildcard/);
        });
      });
    });

    it('rejects a search with no request context at all', () => {
      expect(() => resolveScope()).toThrow(/no request context/);
    });

    /**
     * The arms take a `ScopedQuery` they cannot construct themselves. Handing one
     * a permissive look-alike — the shape a careless refactor would produce —
     * must fail before any SQL is emitted.
     */
    it.each(ARM_NAMES)('refuses to emit the %s arm from a forged scoped query', (arm) => {
      const forged = {
        text: 'true',
        values: [],
        nextIndex: 1,
        scope: { tenantId: 'tenant-a', userId: 'user-1' },
        kind: 'message',
      } as unknown as ReturnType<typeof scopedQuery>;

      expect(() => rawArmBuilders[arm](forged)).toThrow(/no Scope supplied/);
    });

    it('refuses to build a scoped query from an unbranded scope', () => {
      const forged = { tenantId: 'tenant-a', userId: 'user-1' } as unknown as Scope;
      expect(() => scopedQuery(forged, 'message')).toThrow(/no Scope supplied/);
    });

    it.each(['tenant_id = $1', 'user_id = $2'])(
      'refuses to emit SQL when the %s predicate was refactored away',
      (clause) => {
        const scoped = scopedQuery(scopeOf(ALICE), 'message');
        const damaged = { ...scoped, text: scoped.text.replace(`d.${clause}`, 'true') };
        expect(() => assertScopedQuery(damaged)).toThrow();
      },
    );
  });
});

async function asReader<T>(
  pool: SearchPool,
  scope: Scope,
  fn: (client: SearchClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${READER_ROLE}`);
    await applyScope(client, scope);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}
