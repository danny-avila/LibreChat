import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { DEDICATED_CONFIG_SECTIONS, READ_ONLY_CONFIG_SECTIONS, getConfigSection } from './config';

export const SCOPE_TYPE_CONFIG: Record<t.ScopePrincipalType | 'BASE', t.ScopeTypeConfigEntry> = {
  BASE: {
    icon: 'settings',
    colorClass: 'text-status-success',
    accentBorderClass: 'border-l-status-success',
    labelKey: 'com_admin_scope_base_config',
    badgeClass: '',
  },
  [PrincipalType.ROLE]: {
    icon: 'briefcase',
    colorClass: 'text-status-warning',
    accentBorderClass: 'border-l-status-warning',
    labelKey: 'com_admin_scope_roles',
    badgeClass: 'badge-role',
  },
  [PrincipalType.GROUP]: {
    icon: 'users',
    colorClass: 'text-status-info',
    accentBorderClass: 'border-l-status-info',
    labelKey: 'com_admin_scope_groups',
    badgeClass: 'badge-group',
  },
  [PrincipalType.USER]: {
    icon: 'user',
    colorClass: 'text-brand-purple',
    accentBorderClass: 'border-l-brand-purple',
    labelKey: 'com_admin_scope_users',
    badgeClass: 'badge-user',
  },
};

/** Safe lookup — falls back to BASE config if the type has no scope entry (e.g. PUBLIC). */
export function getScopeTypeConfig(type: PrincipalType | 'BASE'): t.ScopeTypeConfigEntry {
  return SCOPE_TYPE_CONFIG[type as t.ScopePrincipalType | 'BASE'] ?? SCOPE_TYPE_CONFIG.BASE;
}

/**
 * Priority each kind of profile is created with. Higher priority wins, so by
 * default users override groups, groups override roles, and roles override Base.
 */
export const DEFAULT_SCOPE_PRIORITY: Readonly<Record<t.ScopePrincipalType, number>> = {
  [PrincipalType.ROLE]: 10,
  [PrincipalType.GROUP]: 20,
  [PrincipalType.USER]: 100,
};

/** Sections LibreChat reads before sign-in, when no role, group or user profile can apply. */
const PRE_AUTH_SECTIONS = ['registration'];

/**
 * Top-level sections that cannot be set per profile, with the reason (WS8).
 * In a profile they render as an "Applies to everyone — edit in Base" card and
 * their paths are never sent.
 */
export const SCOPE_GATED_SECTIONS: ReadonlyMap<string, t.ScopeGateReason> = new Map<
  string,
  t.ScopeGateReason
>([
  ...READ_ONLY_CONFIG_SECTIONS,
  ...[...DEDICATED_CONFIG_SECTIONS].map((section): [string, t.ScopeGateReason] => [
    section,
    'tenantWide',
  ]),
  ...PRE_AUTH_SECTIONS.map((section): [string, t.ScopeGateReason] => [section, 'preAuth']),
]);

/** Why `path` (or its section) cannot be set per profile, if it can't. */
export function getScopeGateReason(path: string): t.ScopeGateReason | undefined {
  return SCOPE_GATED_SECTIONS.get(getConfigSection(path));
}
