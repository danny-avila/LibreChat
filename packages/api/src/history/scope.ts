/**
 * PROVISIONAL LOCAL COPY OF THE SHARED SCOPE CORE — DELETE ON MERGE.
 *
 * PLAN "Multi-tenancy and scope safety" places the safety-critical half of scope
 * handling — ALS resolution, base-tenant normalization, rejection of empty and
 * system scope, and the brand — in
 * `packages/data-schemas/src/config/tenantContext.ts`, beside `SYSTEM_TENANT_ID`
 * and `BASE_TENANT_ID`. Track 4 owns that file and is adding it. That half must
 * exist EXACTLY ONCE: two builders is precisely the drift the shared-builder
 * rule exists to prevent, and a second copy would let the PostgreSQL and
 * ClickHouse arms disagree about what "scoped" means.
 *
 * SQL dialect rendering genuinely cannot be shared — `{name:Type}` parameters
 * are a ClickHouse spelling — so that part stays per-store in `predicate.ts`.
 *
 * This file exists only so track 6 can land ahead of track 4. It is structured
 * to be a drop-in: `predicate.ts` imports `Scope` / `assertScope` / the error
 * type and nothing else from here, so the migration is a one-line import swap to
 * `@librechat/data-schemas` plus deleting this file. Nothing below renders SQL,
 * and nothing in `predicate.ts` validates identity.
 *
 * Two properties must survive that swap, because the leak matrix asserts them:
 *   1. Construction throws on unscoped input — there is no widened fallback.
 *   2. A plain object shaped like a `Scope` is rejected; the brand is a
 *      module-private symbol, not a structural field anyone can forge.
 */

/** Non-tenant OSS data. An absent tenant normalizes to this, never to a wildcard. */
export const BASE_TENANT_ID = '__BASE__';

/**
 * `__SYSTEM__` is a query-time WILDCARD in this codebase (`tenantIsolation`
 * skips filter injection under `runAsSystem()`). Porting that semantic into a
 * store predicate would hand every background-context search cross-tenant
 * scope, so it is rejected as a scope rather than special-cased into one.
 */
export const SYSTEM_TENANT_ID = '__SYSTEM__';

const SCOPE_BRAND: unique symbol = Symbol('librechat.chat_search.scope');

/** A resolved, validated principal. Obtainable only from `resolveScope`. */
export interface Scope {
  readonly [SCOPE_BRAND]: true;
  readonly tenantId: string;
  readonly userId: string;
}

export class UnscopedQueryError extends Error {
  constructor(reason: string) {
    super(`refusing to operate without a resolved scope: ${reason}`);
    this.name = 'UnscopedQueryError';
  }
}

export type ScopeInput = Readonly<{
  tenantId?: string | null;
  userId?: string | null;
}>;

/**
 * Resolution order matters (PLAN [R9]): NORMALIZE first, then fail closed.
 * `getTenantId() === undefined` is the normal OSS case and resolves to
 * `BASE_TENANT_ID`; failing on "empty tenant" before normalization would break
 * search for every non-tenant deployment. Only then are the genuinely unsafe
 * cases rejected: no user at all, or the system wildcard.
 */
export function resolveScope(input: ScopeInput): Scope {
  const rawTenant = typeof input?.tenantId === 'string' ? input.tenantId.trim() : '';
  const tenantId = rawTenant.length === 0 ? BASE_TENANT_ID : rawTenant;
  const userId = typeof input?.userId === 'string' ? input.userId.trim() : '';

  if (userId.length === 0) {
    throw new UnscopedQueryError('userId is missing or empty');
  }
  if (tenantId === SYSTEM_TENANT_ID) {
    throw new UnscopedQueryError('the system tenant is a query-time wildcard, never a scope');
  }

  return { [SCOPE_BRAND]: true, tenantId, userId };
}

/**
 * Brand check. Rejects both an absent scope and a structurally identical plain
 * object, so no caller can hand a store a scope that skipped `resolveScope`.
 */
export function assertScope(scope: Scope | undefined | null): Scope {
  if (!scope || scope[SCOPE_BRAND] !== true) {
    throw new UnscopedQueryError('no resolved Scope supplied — build one with resolveScope()');
  }
  if (typeof scope.tenantId !== 'string' || scope.tenantId.length === 0) {
    throw new UnscopedQueryError('Scope carries no tenantId');
  }
  if (typeof scope.userId !== 'string' || scope.userId.length === 0) {
    throw new UnscopedQueryError('Scope carries no userId');
  }
  return scope;
}
