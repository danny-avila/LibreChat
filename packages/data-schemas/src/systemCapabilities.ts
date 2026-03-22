import type { z } from 'zod';
import type { TCustomConfig, configSchema } from 'librechat-data-provider';
import { PrincipalType, PrincipalModel, ResourceType } from 'librechat-data-provider';

// ---------------------------------------------------------------------------
// System Capabilities
// ---------------------------------------------------------------------------

/**
 * The canonical set of base system capabilities.
 *
 * These are used by the admin panel and LibreChat API to gate access to
 * admin features. Config-section-derived capabilities (e.g.
 * `manage:configs:endpoints`) are built on top of these where the
 * configSchema is available.
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
// Config section capabilities (derived from configSchema)
// ---------------------------------------------------------------------------

/** Top-level keys of the configSchema from librechat.yaml. */
export type ConfigSection = keyof z.infer<typeof configSchema>;

/** Section-level config capabilities derived from configSchema keys. */
type ConfigSectionCapability = `manage:configs:${ConfigSection}` | `read:configs:${ConfigSection}`;

/** Principal-scoped config assignment capabilities. */
type ConfigAssignCapability = `assign:configs:${ConfigAssignTarget}`;

/**
 * Union of all valid capability strings:
 * - Base capabilities from SystemCapabilities
 * - Section-level config capabilities (manage:configs:<section>, read:configs:<section>)
 * - Config assignment capabilities (assign:configs:<user|group|role>)
 */
export type SystemCapability =
  | BaseSystemCapability
  | ConfigSectionCapability
  | ConfigAssignCapability;

/**
 * Maps each ACL ResourceType to the SystemCapability that grants
 * unrestricted management access. Typed as `Record<ResourceType, …>`
 * so adding a new ResourceType variant causes a compile error until a
 * capability is assigned here.
 */
export const ResourceCapabilityMap: Record<ResourceType, SystemCapability> = {
  [ResourceType.AGENT]: SystemCapabilities.MANAGE_AGENTS,
  [ResourceType.PROMPTGROUP]: SystemCapabilities.MANAGE_PROMPTS,
  [ResourceType.MCPSERVER]: SystemCapabilities.MANAGE_MCP_SERVERS,
  [ResourceType.REMOTE_AGENT]: SystemCapabilities.MANAGE_AGENTS,
};

/**
 * Derives a section-level config management capability from a configSchema key.
 * @example configCapability('endpoints') → 'manage:configs:endpoints'
 *
 * TODO: Section-level config capabilities are scaffolded but not yet active.
 * To activate delegated config management:
 *  1. Expose POST/DELETE /api/admin/grants endpoints (wiring grantCapability/revokeCapability)
 *  2. Seed section-specific grants for delegated admin roles via those endpoints
 *  3. Guard config write handlers with hasConfigCapability(user, section)
 */
export function configCapability(section: ConfigSection): `manage:configs:${ConfigSection}` {
  return `manage:configs:${section}`;
}

/**
 * Derives a section-level config read capability from a configSchema key.
 * @example readConfigCapability('endpoints') → 'read:configs:endpoints'
 */
export function readConfigCapability(section: ConfigSection): `read:configs:${ConfigSection}` {
  return `read:configs:${section}`;
}

// ---------------------------------------------------------------------------
// Admin API response types
// ---------------------------------------------------------------------------

/** Config document as returned by the admin API (no Mongoose internals). */
export type AdminConfig = {
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

export type AdminConfigListResponse = {
  configs: AdminConfig[];
};

export type AdminConfigResponse = {
  config: AdminConfig;
};

export type AdminConfigDeleteResponse = {
  success: boolean;
};

/** Audit action types for grant changes. */
export type AuditAction = 'grant_assigned' | 'grant_removed';

/** SystemGrant document as returned by the admin API. */
export type AdminSystemGrant = {
  id: string;
  principalType: PrincipalType;
  principalId: string;
  capability: string;
  grantedBy?: string;
  grantedAt: string;
  expiresAt?: string;
};

/** Audit log entry for grant changes as returned by the admin API. */
export type AdminAuditLogEntry = {
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

/** Group as returned by the admin API. */
export type AdminGroup = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  topMembers: { name: string }[];
  isActive: boolean;
};

/** Member entry as returned by the admin API for group/role membership lists. */
export type AdminMember = {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  joinedAt: string;
};

/** Minimal user info returned by user search endpoints. */
export type AdminUserSearchResult = {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

/** UI grouping of capabilities for the admin panel's capability editor. */
export type CapabilityCategory = {
  key: string;
  labelKey: string;
  capabilities: BaseSystemCapability[];
};

/** Pre-defined UI categories for grouping capabilities in the admin panel. */
export const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
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
