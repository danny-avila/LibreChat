import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId?: string;
}

/** Sentinel value for deliberate cross-tenant system operations */
export const SYSTEM_TENANT_ID = '__SYSTEM__';

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/** Returns the current tenant ID from async context, or undefined if none is set */
export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

/** Runs a function in an explicit cross-tenant system context (bypasses tenant filtering) */
export function runAsSystem<T>(fn: () => T): T {
  return tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, fn);
}
