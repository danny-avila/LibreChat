import { ACCESS_ROLE_IDS } from 'librechat-data-provider';

export interface ResourceConfig {
  resourceType: string;
  defaultViewerRoleId: string;
  defaultEditorRoleId: string;
  defaultOwnerRoleId: string;
  getResourceUrl?: (resourceId: string) => string;
  getResourceName: (resourceName?: string) => string;
  getShareMessage: (resourceName?: string) => string;
  getManageMessage: (resourceName?: string) => string;
  getCopyUrlMessage: () => string;
}

export const RESOURCE_CONFIGS: Record<string, ResourceConfig> = {
  agent: {
    resourceType: 'agent',
    defaultViewerRoleId: ACCESS_ROLE_IDS.AGENT_VIEWER,
    defaultEditorRoleId: ACCESS_ROLE_IDS.AGENT_EDITOR,
    defaultOwnerRoleId: ACCESS_ROLE_IDS.AGENT_OWNER,
    getResourceUrl: (agentId: string) => `${window.location.origin}/c/new?agent_id=${agentId}`,
    getResourceName: (name?: string) => (name && name !== '' ? `"${name}"` : 'agent'),
    getShareMessage: (name?: string) => (name && name !== '' ? `"${name}"` : 'agent'),
    getManageMessage: (name?: string) =>
      `Manage permissions for ${name && name !== '' ? `"${name}"` : 'agent'}`,
    getCopyUrlMessage: () => 'Agent URL copied',
  },
  promptGroup: {
    resourceType: 'promptGroup',
    defaultViewerRoleId: ACCESS_ROLE_IDS.PROMPTGROUP_VIEWER,
    defaultEditorRoleId: ACCESS_ROLE_IDS.PROMPTGROUP_EDITOR,
    defaultOwnerRoleId: ACCESS_ROLE_IDS.PROMPTGROUP_OWNER,
    getResourceName: (name?: string) => (name && name !== '' ? `"${name}"` : 'prompt'),
    getShareMessage: (name?: string) => (name && name !== '' ? `"${name}"` : 'prompt'),
    getManageMessage: (name?: string) =>
      `Manage permissions for ${name && name !== '' ? `"${name}"` : 'prompt'}`,
    getCopyUrlMessage: () => 'Prompt URL copied',
  },
};

export const getResourceConfig = (resourceType: string): ResourceConfig | undefined => {
  return RESOURCE_CONFIGS[resourceType];
};
