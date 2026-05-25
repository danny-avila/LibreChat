import { SystemRoles } from 'librechat-data-provider';

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
