import { SYSTEM_TENANT_ID } from '~/config/tenantContext';

export const MAX_TENANT_ID_LENGTH = 128;
export const VALID_TENANT_ID_PATTERN = /^[-a-zA-Z0-9_.]+$/;

export function isValidTenantId(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_TENANT_ID_LENGTH &&
    trimmed !== SYSTEM_TENANT_ID &&
    VALID_TENANT_ID_PATTERN.test(trimmed)
  );
}

export function normalizeTenantId(value: string): string {
  return value.trim();
}
