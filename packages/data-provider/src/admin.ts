import type { TCustomConfig } from './config';
import type { PrincipalType, PrincipalModel } from './accessPermissions';

// ---------------------------------------------------------------------------
// System Capabilities
// ---------------------------------------------------------------------------

/**
 * The canonical set of base system capabilities.
 *
 * These are used by the admin panel and LibreChat API to gate access to
 * admin features. Config-section-derived capabilities (e.g.
 * `manage:configs:endpoints`) are built on top of these in
 * `@librechat/data-schemas` where the configSchema is available.
 */
export const SystemCapabilities = {
  ACCESS_ADMIN: 'access:admin',
  READ_USERS: 'read:users',
  MANAGE_USERS: 'manage:users',
  READ_GROUPS: 'read:groups',
  MANAGE_GROUPS: 'manage:groups',
  READ_ROLES: 'read:roles',
  MANAGE_ROLES: 'manage:roles',
  READ_CONFIGS: 'read:configs',
  MANAGE_CONFIGS: 'manage:configs',
  ASSIGN_CONFIGS: 'assign:configs',
  READ_USAGE: 'read:usage',
  READ_AGENTS: 'read:agents',
  MANAGE_AGENTS: 'manage:agents',
  MANAGE_MCP_SERVERS: 'manage:mcpservers',
  READ_PROMPTS: 'read:prompts',
  MANAGE_PROMPTS: 'manage:prompts',
  /** Reserved — not yet enforced by any middleware. */
  READ_ASSISTANTS: 'read:assistants',
  MANAGE_ASSISTANTS: 'manage:assistants',
} as const;

/** Base capabilities defined in the SystemCapabilities object. */
export type BaseSystemCapability = (typeof SystemCapabilities)[keyof typeof SystemCapabilities];

/** Principal types that can receive config overrides. */
export type ConfigAssignTarget = 'user' | 'group' | 'role';

/**
 * Capabilities that are implied by holding a broader capability.
 * e.g. `MANAGE_USERS` implies `READ_USERS`.
 */
export const CapabilityImplications: Partial<Record<BaseSystemCapability, BaseSystemCapability[]>> =
  {
    [SystemCapabilities.MANAGE_USERS]: [SystemCapabilities.READ_USERS],
    [SystemCapabilities.MANAGE_GROUPS]: [SystemCapabilities.READ_GROUPS],
    [SystemCapabilities.MANAGE_ROLES]: [SystemCapabilities.READ_ROLES],
    [SystemCapabilities.MANAGE_CONFIGS]: [SystemCapabilities.READ_CONFIGS],
    [SystemCapabilities.MANAGE_AGENTS]: [SystemCapabilities.READ_AGENTS],
    [SystemCapabilities.MANAGE_PROMPTS]: [SystemCapabilities.READ_PROMPTS],
    [SystemCapabilities.MANAGE_ASSISTANTS]: [SystemCapabilities.READ_ASSISTANTS],
  };

// ---------------------------------------------------------------------------
// Capability utility functions
// ---------------------------------------------------------------------------

/** Reverse map: for a given read capability, which manage capabilities imply it? */
const _impliedBy: Record<string, string[]> = {};
for (const [manage, reads] of Object.entries(CapabilityImplications)) {
  for (const read of reads as string[]) {
    if (!_impliedBy[read]) {
      _impliedBy[read] = [];
    }
    _impliedBy[read].push(manage);
  }
}

/**
 * Check whether a set of held capabilities satisfies a required capability,
 * accounting for the manage→read implication hierarchy.
 */
export function hasImpliedCapability(held: string[], required: string): boolean {
  if (held.includes(required)) {
    return true;
  }
  const impliers = _impliedBy[required];
  if (impliers) {
    for (const cap of impliers) {
      if (held.includes(cap)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Given a set of directly-held capabilities, compute the full set including
 * all implied capabilities.
 */
export function expandImplications(directCaps: string[]): string[] {
  const expanded = new Set(directCaps);
  for (const cap of directCaps) {
    const implied = CapabilityImplications[cap as BaseSystemCapability];
    if (implied) {
      for (const imp of implied) {
        expanded.add(imp);
      }
    }
  }
  return Array.from(expanded);
}

// ---------------------------------------------------------------------------
// Admin API types — Config overrides
// ---------------------------------------------------------------------------

/**
 * Config override document as returned by the admin API.
 * This is the API-friendly (non-Mongoose) version of the Config document.
 */
export type TAdminConfig = {
  _id: string;
  principalType: PrincipalType;
  principalId: string;
  principalModel: PrincipalModel;
  priority: number;
  overrides: Partial<TCustomConfig>;
  isActive: boolean;
  configVersion: number;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Admin API types — System Grants
// ---------------------------------------------------------------------------

/** Audit action types for grant changes. */
export type AuditAction = 'grant_assigned' | 'grant_removed';

/**
 * SystemGrant document as returned by the admin API.
 * API-friendly (non-Mongoose) version.
 */
export type TAdminSystemGrant = {
  id: string;
  principalType: PrincipalType;
  principalId: string;
  capability: string;
  grantedBy?: string;
  grantedAt: string;
  expiresAt?: string;
};

/**
 * Audit log entry for grant changes as returned by the admin API.
 */
export type TAdminAuditLogEntry = {
  id: string;
  action: AuditAction;
  actorId: string;
  actorName: string;
  targetPrincipalType: PrincipalType;
  targetPrincipalId: string;
  targetName: string;
  capability: string;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Admin API types — Groups
// ---------------------------------------------------------------------------

/**
 * Group as returned by the admin API.
 */
export type TAdminGroup = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  topMembers: { name: string }[];
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Admin API types — Members
// ---------------------------------------------------------------------------

/**
 * Member entry as returned by the admin API for group/role membership lists.
 */
export type TAdminMember = {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  joinedAt: string;
};

/**
 * Minimal user info returned by user search endpoints.
 */
export type TAdminUserSearchResult = {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

// ---------------------------------------------------------------------------
// Admin API types — Capability UI categories
// ---------------------------------------------------------------------------

/**
 * UI grouping of capabilities for the admin panel's capability editor.
 */
export type TCapabilityCategory = {
  key: string;
  labelKey: string;
  capabilities: BaseSystemCapability[];
};

/**
 * Pre-defined UI categories for grouping capabilities in the admin panel.
 */
export const CAPABILITY_CATEGORIES: TCapabilityCategory[] = [
  {
    key: 'users',
    labelKey: 'com_cap_cat_users',
    capabilities: [SystemCapabilities.MANAGE_USERS, SystemCapabilities.READ_USERS],
  },
  {
    key: 'groups',
    labelKey: 'com_cap_cat_groups',
    capabilities: [SystemCapabilities.MANAGE_GROUPS, SystemCapabilities.READ_GROUPS],
  },
  {
    key: 'roles',
    labelKey: 'com_cap_cat_roles',
    capabilities: [SystemCapabilities.MANAGE_ROLES, SystemCapabilities.READ_ROLES],
  },
  {
    key: 'config',
    labelKey: 'com_cap_cat_config',
    capabilities: [
      SystemCapabilities.MANAGE_CONFIGS,
      SystemCapabilities.READ_CONFIGS,
      SystemCapabilities.ASSIGN_CONFIGS,
    ],
  },
  {
    key: 'content',
    labelKey: 'com_cap_cat_content',
    capabilities: [
      SystemCapabilities.MANAGE_AGENTS,
      SystemCapabilities.READ_AGENTS,
      SystemCapabilities.MANAGE_PROMPTS,
      SystemCapabilities.READ_PROMPTS,
      SystemCapabilities.MANAGE_ASSISTANTS,
      SystemCapabilities.READ_ASSISTANTS,
      SystemCapabilities.MANAGE_MCP_SERVERS,
    ],
  },
  {
    key: 'system',
    labelKey: 'com_cap_cat_system',
    capabilities: [SystemCapabilities.ACCESS_ADMIN, SystemCapabilities.READ_USAGE],
  },
];
