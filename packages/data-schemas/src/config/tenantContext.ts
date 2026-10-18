import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  requestMethod?: string;
  requestPath?: string;
  /**
   * The platform operator is acting: an admin-panel request, or a request from the operator's
   * hidden access to an organization. Set only by trusted request middleware. Audit entries
   * written under it go to the platform chain, so the organization never sees the operator.
   */
  operatorActing?: boolean;
}

/** The correlation fields every derived context keeps from the one it was entered from. */
function inheritedContext(): Omit<TenantContext, 'tenantId'> {
  const { requestId, userId, requestMethod, requestPath, operatorActing } =
    tenantStorage.getStore() ?? {};
  return { requestId, userId, requestMethod, requestPath, operatorActing };
}

/** Sentinel value for deliberate cross-tenant system operations */
export const SYSTEM_TENANT_ID = '__SYSTEM__';

/**
 * Tenant that holds login accounts when organizations are enabled. An account carries the
 * credentials (password, 2FA, passkeys) and nothing else: app data lives under each
 * organization's own tenant, so request-scoped routes reject this tenant exactly as they
 * reject the system sentinel, and no app access token is ever issued for an account.
 */
export const ACCOUNTS_TENANT_ID = '__ACCOUNTS__';

/**
 * Scope for the platform operator's deployment-wide records: everything stored without a tenant
 * (platform configuration defaults, platform grants, roles and groups). Work in it sees only
 * untenanted records and never stamps a tenant, so it can neither read nor write an
 * organization's data. Request-scoped routes reject it like the other sentinels; only the
 * operator's admin scope enters it.
 */
export const PLATFORM_TENANT_ID = '__PLATFORM__';

/** Whether a tenant id is a reserved sentinel rather than a real (organization) tenant. */
export function isReservedTenantId(tenantId: string | null | undefined): boolean {
  return (
    tenantId === SYSTEM_TENANT_ID ||
    tenantId === ACCOUNTS_TENANT_ID ||
    tenantId === PLATFORM_TENANT_ID
  );
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

/** Whether the platform operator is acting in the current async context. */
export function isOperatorActing(): boolean {
  return tenantStorage.getStore()?.operatorActing === true;
}

/**
 * Runs a function in an explicit cross-tenant system context (bypasses tenant filtering).
 * The callback MUST be async — sync callbacks returning Mongoose thenables will lose context.
 */
export function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ ...inheritedContext(), tenantId: SYSTEM_TENANT_ID }, fn);
}

/**
 * Runs a function scoped to one tenant, keeping the current request correlation fields.
 * The callback MUST be async — sync callbacks returning Mongoose thenables will lose context.
 */
export function runInTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ ...inheritedContext(), tenantId }, fn);
}

/** Runs a function in the accounts tenant, where queries see login accounts only. */
export function runInAccounts<T>(fn: () => Promise<T>): Promise<T> {
  return runInTenant(ACCOUNTS_TENANT_ID, fn);
}

/** Runs a function in the platform scope, where queries see untenanted records only. */
export function runInPlatform<T>(fn: () => Promise<T>): Promise<T> {
  return runInTenant(PLATFORM_TENANT_ID, fn);
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
