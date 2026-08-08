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
import { scopeGucStatement } from './scope';

const asScope = (tenantId: string, userId: string): Scope => createScope({ tenantId, userId });

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
    expect(() => scopeGucStatement({ tenantId: 'a', userId: 'b' } as unknown as Scope)).toThrow(
      /no Scope supplied/,
    );
  });

  it('refuses to bind a scope-shaped object carrying a permissive predicate', () => {
    const forged = {
      tenantId: 'acme',
      userId: 'alice',
      predicateSql: '1 = 1',
    } as unknown as Scope;
    expect(() => scopeGucStatement(forged)).toThrow(/no Scope supplied/);
  });
});
