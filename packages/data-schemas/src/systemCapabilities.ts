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
