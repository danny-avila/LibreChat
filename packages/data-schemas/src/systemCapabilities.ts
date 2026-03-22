import type { z } from 'zod';
import type { configSchema } from 'librechat-data-provider';
import { ResourceType, SystemCapabilities, CapabilityImplications } from 'librechat-data-provider';
import type { BaseSystemCapability, ConfigAssignTarget } from 'librechat-data-provider';

// Re-export base types from data-provider so existing consumers don't break
export { SystemCapabilities, CapabilityImplications };
export type { BaseSystemCapability, ConfigAssignTarget };

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
