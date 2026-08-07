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
