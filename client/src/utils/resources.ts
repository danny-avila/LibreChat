import { AccessRoleIds, ResourceType } from 'librechat-data-provider';

export interface ResourceConfig {
  resourceType: ResourceType;
  defaultViewerRoleId: AccessRoleIds;
  defaultEditorRoleId: AccessRoleIds;
  defaultOwnerRoleId: AccessRoleIds;
  getResourceUrl?: (resourceId: string) => string;
  getResourceName: (resourceName?: string) => string;
  getShareMessage: (resourceName?: string) => string;
  getManageMessage: (resourceName?: string) => string;
  getCopyUrlMessage: () => string;
}

export const RESOURCE_CONFIGS: Record<ResourceType, ResourceConfig> = {
  [ResourceType.AGENT]: {
    resourceType: ResourceType.AGENT,
    defaultViewerRoleId: AccessRoleIds.AGENT_VIEWER,
    defaultEditorRoleId: AccessRoleIds.AGENT_EDITOR,
    defaultOwnerRoleId: AccessRoleIds.AGENT_OWNER,
    getResourceUrl: (agentId: string) => `${window.location.origin}/c/new?agent_id=${agentId}`,
    getResourceName: (name?: string) => (name && name !== '' ? `"${name}"` : 'agent'),
    getShareMessage: (name?: string) => (name && name !== '' ? `"${name}"` : 'agent'),
    getManageMessage: (name?: string) =>
      `Manage permissions for ${name && name !== '' ? `"${name}"` : 'agent'}`,
    getCopyUrlMessage: () => 'Agent URL copied',
  },
  [ResourceType.PROMPTGROUP]: {
    resourceType: ResourceType.PROMPTGROUP,
    defaultViewerRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
    defaultEditorRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
    defaultOwnerRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
    getResourceName: (name?: string) => (name && name !== '' ? `"${name}"` : 'prompt'),
    getShareMessage: (name?: string) => (name && name !== '' ? `"${name}"` : 'prompt'),
    getManageMessage: (name?: string) =>
      `Manage permissions for ${name && name !== '' ? `"${name}"` : 'prompt'}`,
    getCopyUrlMessage: () => 'Prompt URL copied',
  },
};

export const getResourceConfig = (resourceType: ResourceType): ResourceConfig | undefined => {
  return RESOURCE_CONFIGS[resourceType];
};
