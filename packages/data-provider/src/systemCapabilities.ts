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
  READ_PROMPTS: 'read:prompts',
  MANAGE_PROMPTS: 'manage:prompts',
  MANAGE_ASSISTANTS: 'manage:assistants',
} as const;

export type SystemCapability = (typeof SystemCapabilities)[keyof typeof SystemCapabilities];

export interface ISystemGrant {
  principalType: string;
  principalId: string;
  capability: SystemCapability;
  tenantId?: string;
  grantedBy?: string;
  grantedAt: Date;
}
