import {
  createScope,
  resolveScope,
  runAsSystem,
  tenantStorage,
  BASE_TENANT_ID,
  SYSTEM_TENANT_ID,
  UnscopedAccessError,
} from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
import { assertScopedQuery, scopeGucStatement, scopedQuery } from './scope';

const asScope = (tenantId: string, userId: string): Scope => createScope({ tenantId, userId });

/** Everything a caller could put on a hand-rolled scope except the brand itself. */
type ScopeShaped = Partial<Scope> & { predicateSql?: string };

describe('scope resolution', () => {
  it('normalizes an absent tenant to the base sentinel before failing closed', async () => {
    await tenantStorage.run({ userId: 'alice' }, async () => {
      expect(resolveScope().tenantId).toBe(BASE_TENANT_ID);
    });
  });

  it('normalizes an empty tenant to the base sentinel', async () => {
    await tenantStorage.run({ tenantId: '   ', userId: 'alice' }, async () => {
      expect(resolveScope().tenantId).toBe(BASE_TENANT_ID);
    });
  });

  it('preserves a real tenant', async () => {
    await tenantStorage.run({ tenantId: 'acme', userId: 'alice' }, async () => {
      expect(resolveScope()).toMatchObject({ tenantId: 'acme', userId: 'alice' });
    });
  });

  it('rejects a background context with no ALS store', () => {
    expect(() => resolveScope()).toThrow(UnscopedAccessError);
  });

  it('rejects a context with no user', async () => {
    await tenantStorage.run({ tenantId: 'acme' }, async () => {
      expect(() => resolveScope()).toThrow(/userId is missing/);
    });
  });

  /**
   * `runAsSystem()` sets `__SYSTEM__`, which `tenantIsolation` treats as a
   * query-time wildcard. Search must reject it, never inherit it.
   */
  it('rejects search invoked inside runAsSystem()', async () => {
    await tenantStorage.run({ tenantId: 'acme', userId: 'alice' }, async () => {
      await runAsSystem(async () => {
        expect(() => resolveScope()).toThrow(/query-time wildcard/);
      });
    });
  });

  it('rejects the system tenant even when built explicitly', () => {
    expect(() => createScope({ tenantId: SYSTEM_TENANT_ID, userId: 'alice' })).toThrow(
      UnscopedAccessError,
    );
  });
});

describe('PostgreSQL scope rendering', () => {
  it('emits tenant, user and kind predicates with positional parameters', () => {
    const query = scopedQuery(asScope('acme', 'alice'), 'message');
    expect(query.text).toContain('d.tenant_id = $1');
    expect(query.text).toContain('d.user_id = $2');
    expect(query.text).toContain('d.kind = $3');
    expect(query.values.slice(0, 3)).toEqual(['acme', 'alice', 'message']);
    expect(query.nextIndex).toBe(5);
  });

  it('folds visibility into the same inseparable predicate', () => {
    const query = scopedQuery(asScope('acme', 'alice'), 'message');
    expect(query.text).toContain('d.deleted_at IS NULL');
    expect(query.text).toContain('d.is_temporary = false');
    expect(query.text).toContain('d.expires_at IS NULL OR d.expires_at > $4');
  });

  it('pins one instant across every arm in a request', () => {
    const now = new Date('2026-08-07T00:00:00Z');
    const query = scopedQuery(asScope('acme', 'alice'), 'message', { now });
    expect(query.values[3]).toBe(now);
  });

  it('refuses an unbranded scope object', () => {
    const forged = { tenantId: 'acme', userId: 'alice' } as unknown as Scope;
    expect(() => scopedQuery(forged, 'message')).toThrow(/no Scope supplied/);
  });

  it('refuses a scope-shaped object carrying a permissive predicate', () => {
    const forged = {
      tenantId: 'acme',
      userId: 'alice',
      predicateSql: '1 = 1',
    } as unknown as Scope;
    expect(() => scopedQuery(forged, 'message')).toThrow(/no Scope supplied/);
  });

  it('refuses an unknown record kind', () => {
    expect(() => scopedQuery(asScope('acme', 'alice'), 'files' as unknown as 'message')).toThrow(
      /not a searchable record kind/,
    );
  });

  it('refuses an unsafe table alias', () => {
    expect(() => scopedQuery(asScope('acme', 'alice'), 'message', { alias: 'd; DROP' })).toThrow(
      /unsafe table alias/,
    );
  });

  it('accepts a well-formed alias and uses it throughout', () => {
    const query = scopedQuery(asScope('acme', 'alice'), 'conversation', { alias: 'docs' });
    expect(query.text).toContain('docs.tenant_id = $1');
    expect(query.text).not.toContain('d.tenant_id');
  });
});

describe('assertScopedQuery', () => {
  it('accepts a query built through the factory', () => {
    const query = scopedQuery(asScope('acme', 'alice'), 'message');
    expect(assertScopedQuery(query)).toBe(query);
  });

  it('rejects a missing query', () => {
    expect(() => assertScopedQuery(undefined)).toThrow(/no ScopedQuery supplied/);
  });

  it.each([
    ['tenant', 'd.tenant_id = $1', 'tenant predicate'],
    ['user', 'd.user_id = $2', 'user predicate'],
    ['deletion', 'd.deleted_at IS NULL', 'deletion filter'],
  ])('rejects a query whose %s clause was refactored away', (_label, clause, message) => {
    const query = scopedQuery(asScope('acme', 'alice'), 'message');
    const damaged = { ...query, text: query.text.replace(clause, 'true') };
    expect(() => assertScopedQuery(damaged)).toThrow(new RegExp(message));
  });
});

describe('RLS session settings', () => {
  it('binds both GUCs transaction-locally', () => {
    const statement = scopeGucStatement(asScope('acme', 'alice'));
    expect(statement.text).toBe('SELECT set_config($1, $2, true), set_config($3, $4, true)');
    expect(statement.values).toEqual([
      'chat_search.tenant_id',
      'acme',
      'chat_search.user_id',
      'alice',
    ]);
  });

  it('refuses to bind an unbranded scope', () => {
    expect(() => scopeGucStatement({ tenantId: 'a', userId: 'b' } as Scope)).toThrow(
      /no Scope supplied/,
    );
  });

  it('refuses to bind a scope-shaped object carrying a permissive predicate', () => {
    const forged: ScopeShaped = {
      tenantId: 'acme',
      userId: 'alice',
      predicateSql: '1 = 1',
    };
    expect(() => scopeGucStatement(forged as Scope)).toThrow(/no Scope supplied/);
  });
});
