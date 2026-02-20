import { ResourceType } from './accessPermissions';

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
  MANAGE_CONFIGS_ENDPOINTS: 'manage:configs:endpoints',
  MANAGE_CONFIGS_MODELS: 'manage:configs:models',
  READ_USAGE: 'read:usage',
  READ_AGENTS: 'read:agents',
  MANAGE_AGENTS: 'manage:agents',
  MANAGE_MCP_SERVERS: 'manage:mcpservers',
  READ_PROMPTS: 'read:prompts',
  MANAGE_PROMPTS: 'manage:prompts',
  MANAGE_ASSISTANTS: 'manage:assistants',
} as const;

export type SystemCapability = (typeof SystemCapabilities)[keyof typeof SystemCapabilities];

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

export interface ISystemGrant {
  principalType: string;
  principalId: string;
  capability: SystemCapability;
  tenantId?: string;
  grantedBy?: string;
  grantedAt: Date;
}
