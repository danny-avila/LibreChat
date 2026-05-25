import { SystemRoles } from 'librechat-data-provider';
import { isEnabled } from '~/utils';

export type OpenIdRoleSyncClaimSource = 'access' | 'id' | 'userinfo';

export type OpenIdRoleSyncOptions = {
  enabled: boolean;
  apiEnabled: boolean;
  claimSource: OpenIdRoleSyncClaimSource;
  claim?: string;
  rolePriority: string[];
  fallbackRole?: string;
};

export type OpenIdRoleSyncSelectionInput = {
  currentRole?: string;
  openIdRoleValues?: string | unknown[];
  rolePriority: string[];
  fallbackRole?: string;
};

export type OpenIdRoleSyncSelectionResult = {
  selectedRole?: string;
  reason?: 'matched_priority' | 'kept_current' | 'fallback' | 'no_matching_role';
};

export function parseOpenIdRoleSyncList(value?: string): string[] {
  return (
    value
      ?.split(',')
      .map((role) => role.trim())
      .filter(Boolean) ?? []
  );
}

export function getOpenIdRoleSyncOptions(
  env: NodeJS.ProcessEnv = process.env,
): OpenIdRoleSyncOptions {
  const enabled = isEnabled(env.OPENID_ROLE_SYNC_ENABLED);
  const apiEnabled = isEnabled(env.OPENID_ROLE_SYNC_API_ENABLED);
  const rawSource = env.OPENID_ROLE_SYNC_SOURCE?.trim() || 'id';
  const claimSource = rawSource as OpenIdRoleSyncClaimSource;
  const claim = env.OPENID_ROLE_SYNC_CLAIM?.trim() || undefined;
  const rolePriority = parseOpenIdRoleSyncList(env.OPENID_ROLE_SYNC_ROLE_PRIORITY);
  const fallbackRole = env.OPENID_ROLE_SYNC_FALLBACK_ROLE?.trim() || undefined;

  if (!['access', 'id', 'userinfo'].includes(claimSource)) {
    throw new Error(
      `[openidRoleSync] OPENID_ROLE_SYNC_SOURCE must be one of: access, id, userinfo`,
    );
  }

  if (enabled && !claim) {
    throw new Error(
      '[openidRoleSync] OPENID_ROLE_SYNC_CLAIM is required when role sync is enabled',
    );
  }

  if (apiEnabled && !enabled) {
    throw new Error(
      '[openidRoleSync] OPENID_ROLE_SYNC_API_ENABLED requires OPENID_ROLE_SYNC_ENABLED=true',
    );
  }

  if (rolePriority.some((role) => role.toLowerCase() === SystemRoles.ADMIN.toLowerCase())) {
    throw new Error('[openidRoleSync] OPENID_ROLE_SYNC_ROLE_PRIORITY cannot include ADMIN');
  }

  if (fallbackRole?.toLowerCase() === SystemRoles.ADMIN.toLowerCase()) {
    throw new Error('[openidRoleSync] OPENID_ROLE_SYNC_FALLBACK_ROLE cannot be ADMIN');
  }

  return { enabled, apiEnabled, claimSource, claim, rolePriority, fallbackRole };
}

export function normalizeOpenIdRoleValues(
  openIDRoles?: string | unknown[],
  assignableRoles: string[] = [],
): Set<string> {
  const normalized = new Set<string>();
  const values = Array.isArray(openIDRoles) ? openIDRoles : (openIDRoles?.split(/[\s,]+/) ?? []);
  const assignableRoleKeys = new Set(
    assignableRoles
      .map((role) => role.trim().toLowerCase())
      .filter((role) => role && role !== SystemRoles.ADMIN.toLowerCase()),
  );

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    const key = trimmed.toLowerCase();

    if (
      !trimmed ||
      key === SystemRoles.ADMIN.toLowerCase() ||
      (assignableRoleKeys.size > 0 && !assignableRoleKeys.has(key))
    ) {
      continue;
    }

    normalized.add(key);
  }

  return normalized;
}

export function selectOpenIdRole(
  input: OpenIdRoleSyncSelectionInput,
): OpenIdRoleSyncSelectionResult {
  const assignableRoles = input.fallbackRole
    ? [...input.rolePriority, input.fallbackRole]
    : input.rolePriority;
  const openIdRoleKeys = normalizeOpenIdRoleValues(input.openIdRoleValues, assignableRoles);

  for (const role of input.rolePriority) {
    const trimmed = role.trim();

    if (
      trimmed &&
      trimmed.toLowerCase() !== SystemRoles.ADMIN.toLowerCase() &&
      openIdRoleKeys.has(trimmed.toLowerCase())
    ) {
      return { selectedRole: trimmed, reason: 'matched_priority' };
    }
  }

  if (
    input.currentRole &&
    input.fallbackRole &&
    input.currentRole.trim().toLowerCase() === input.fallbackRole.trim().toLowerCase() &&
    openIdRoleKeys.has(input.currentRole.trim().toLowerCase())
  ) {
    return { selectedRole: input.currentRole, reason: 'kept_current' };
  }

  if (input.fallbackRole) {
    const trimmed = input.fallbackRole.trim();

    if (trimmed && trimmed.toLowerCase() !== SystemRoles.ADMIN.toLowerCase()) {
      return { selectedRole: trimmed, reason: 'fallback' };
    }
  }

  return { reason: 'no_matching_role' };
}
