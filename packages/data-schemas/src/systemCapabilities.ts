import type { z } from 'zod';
import type { configSchema } from 'librechat-data-provider';
import { ResourceType } from 'librechat-data-provider';

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
  READ_ASSISTANTS: 'read:assistants',
  MANAGE_ASSISTANTS: 'manage:assistants',
} as const;

/** Top-level keys of the configSchema from librechat.yaml. */
export type ConfigSection = keyof z.infer<typeof configSchema>;

/** Principal types that can receive config overrides. */
export type ConfigAssignTarget = 'user' | 'group' | 'role';

/** Base capabilities defined in the SystemCapabilities object. */
type BaseSystemCapability = (typeof SystemCapabilities)[keyof typeof SystemCapabilities];

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
 * Capabilities that are implied by holding a broader capability.
 * When `hasCapability` checks for an implied capability, it first expands
 * the principal's grant set — so granting `MANAGE_USERS` automatically
 * satisfies a `READ_USERS` check without a separate grant.
 *
 * Implication is one-directional: `MANAGE_USERS` implies `READ_USERS`,
 * but `READ_USERS` does NOT imply `MANAGE_USERS`.
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

/**
 * Derives a principal-scoped config assignment capability.
 * @example assignConfigCapability('group') → 'assign:configs:group'
 */
export function assignConfigCapability(
  target: ConfigAssignTarget,
): `assign:configs:${ConfigAssignTarget}` {
  return `assign:configs:${target}`;
}
