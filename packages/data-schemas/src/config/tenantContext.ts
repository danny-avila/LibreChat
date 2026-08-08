import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  requestMethod?: string;
  requestPath?: string;
}

/** Sentinel value for deliberate cross-tenant system operations */
export const SYSTEM_TENANT_ID = '__SYSTEM__';

/**
 * Sentinel tenant for non-tenant (OSS) data. Mongo documents with an absent or
 * null `tenantId` normalize to this value everywhere a tenant is required:
 * projector writes, query-path scope resolution, RLS session settings, cursors,
 * and rag_api JWT claims.
 */
export const BASE_TENANT_ID = '__BASE__';

/**
 * Reserved sentinels. Neither may arrive as an *inbound* tenant id, so no real
 * tenant can collide with the base-tenant fallback or inherit the system
 * wildcard by naming itself after it.
 */
export const RESERVED_TENANT_IDS: ReadonlySet<string> = new Set([SYSTEM_TENANT_ID, BASE_TENANT_ID]);

export function isReservedTenantId(tenantId?: string | null): boolean {
  return tenantId != null && RESERVED_TENANT_IDS.has(tenantId);
}

/** Maps an absent or null stored tenant id onto the base-tenant sentinel. */
export function normalizeTenantId(tenantId?: string | null): string {
  return tenantId == null || tenantId === '' ? BASE_TENANT_ID : tenantId;
}

/**
 * Structural scope enforcement, shared by every search tier.
 *
 * Messages and files are user-scoped, not merely tenant-scoped, and they are the
 * kinds whose leakage exposes raw content rather than metadata. Scope is
 * therefore a value you cannot fabricate: the brand is a module-private symbol,
 * so an object merely shaped like a scope cannot be substituted for one, and the
 * only constructor throws rather than ever returning a widened result. There is
 * no "scope optional" path to fall through.
 *
 * Each tier renders this same value in its own dialect — PostgreSQL `$n`
 * predicates plus RLS session GUCs, ClickHouse `{name:Type}` bindings — but none
 * of them re-derives it.
 */
const SCOPE_BRAND: unique symbol = Symbol('librechat.scope');

export interface Scope {
  readonly [SCOPE_BRAND]: true;
  readonly tenantId: string;
  readonly userId: string;
}

export class UnscopedAccessError extends Error {
  constructor(reason: string) {
    super(`refusing to proceed without resolved scope: ${reason}`);
    this.name = 'UnscopedAccessError';
  }
}

/**
 * Builds a branded scope from explicit values.
 *
 * Order matters: normalize first, then fail closed. `tenantId === undefined` is
 * the normal OSS case (no `X-Tenant-Id` header) and resolves to the base tenant.
 * Failing on "empty tenant" *before* normalization would break search for every
 * non-tenant deployment — which is why the check sequence is not interchangeable.
 *
 * `__SYSTEM__` is rejected outright rather than special-cased. In this codebase
 * it is a query-time wildcard — `tenantIsolation` skips filter injection under
 * `runAsSystem()` — so porting that semantic into a store predicate would hand
 * every background context cross-tenant reach.
 */
export function createScope(input: { tenantId?: string | null; userId?: string | null }): Scope {
  const tenantId = normalizeTenantId(
    typeof input?.tenantId === 'string' ? input.tenantId.trim() : input?.tenantId,
  );
  const userId = typeof input?.userId === 'string' ? input.userId.trim() : '';

  if (tenantId === SYSTEM_TENANT_ID) {
    throw new UnscopedAccessError('the system tenant is a query-time wildcard, never a scope');
  }
  if (userId.length === 0) {
    throw new UnscopedAccessError('userId is missing or empty');
  }

  return Object.freeze({ [SCOPE_BRAND]: true, tenantId, userId }) as Scope;
}

/**
 * Resolves scope from the ALS context — never from a query, body, or cursor
 * field. Throws when no request context is active, which is what makes a
 * background (`runAsSystem`) invocation fail rather than widen.
 */
export function resolveScope(): Scope {
  const store = tenantStorage.getStore();
  if (!store) {
    throw new UnscopedAccessError('no request context is active');
  }
  return createScope({ tenantId: store.tenantId, userId: store.userId });
}

/**
 * Gate for every store-facing builder. A forged or absent scope fails here, so
 * no code path reaches a search store without one.
 */
export function assertScope(scope: Scope | null | undefined): Scope {
  if (!scope || (scope as { [SCOPE_BRAND]?: true })[SCOPE_BRAND] !== true) {
    throw new UnscopedAccessError('no Scope supplied — build one with createScope()');
  }
  if (!scope.tenantId || !scope.userId || scope.tenantId === SYSTEM_TENANT_ID) {
    throw new UnscopedAccessError('Scope is missing tenant or user, or names the system tenant');
  }
  return scope;
}

/**
 * AsyncLocalStorage instance for propagating tenant context.
 * Callbacks passed to `tenantStorage.run()` must be `async` for the context to propagate
 * through Mongoose query execution. Sync callbacks returning a Mongoose thenable will lose context.
 */
export const tenantStorage: AsyncLocalStorage<TenantContext> =
  new AsyncLocalStorage<TenantContext>();

/** Returns the current tenant ID from async context, or undefined if none is set */
export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

/** Returns the current user ID from async context, or undefined if none is set */
export function getUserId(): string | undefined {
  return tenantStorage.getStore()?.userId;
}

/** Returns the current request ID from async context, or undefined if none is set */
export function getRequestId(): string | undefined {
  return tenantStorage.getStore()?.requestId;
}

/** Returns the safe request method from async context, or undefined if none is set */
export function getRequestMethod(): string | undefined {
  return tenantStorage.getStore()?.requestMethod;
}

/** Returns the safe request path from async context, or undefined if none is set */
export function getRequestPath(): string | undefined {
  return tenantStorage.getStore()?.requestPath;
}

/**
 * Runs a function in an explicit cross-tenant system context (bypasses tenant filtering).
 * The callback MUST be async — sync callbacks returning Mongoose thenables will lose context.
 */
export function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
  const { requestId, userId, requestMethod, requestPath } = tenantStorage.getStore() ?? {};
  return tenantStorage.run(
    { tenantId: SYSTEM_TENANT_ID, requestId, userId, requestMethod, requestPath },
    fn,
  );
}

/**
 * Appends `:${tenantId}` to a cache key when a non-system tenant context is active.
 * Returns the base key unchanged when no ALS context is set or when running
 * inside `runAsSystem()` (SYSTEM_TENANT_ID context).
 */
export function scopedCacheKey(baseKey: string): string {
  const tenantId = getTenantId();
  if (!tenantId || tenantId === SYSTEM_TENANT_ID) {
    return baseKey;
  }
  return `${baseKey}:${tenantId}`;
}
