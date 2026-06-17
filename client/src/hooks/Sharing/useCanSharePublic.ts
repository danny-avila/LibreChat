import { ResourceType, PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess, useScopeOverrideFeatureAccess } from '~/hooks';

const resourceToPermissionMap: Partial<Record<ResourceType, PermissionTypes>> = {
  [ResourceType.AGENT]: PermissionTypes.AGENTS,
  [ResourceType.PROMPTGROUP]: PermissionTypes.PROMPTS,
  [ResourceType.MCPSERVER]: PermissionTypes.MCP_SERVERS,
  [ResourceType.REMOTE_AGENT]: PermissionTypes.REMOTE_AGENTS,
  [ResourceType.SKILL]: PermissionTypes.SKILLS,
};

/**
 * Hook to check if a user can share a specific resource type publicly (with everyone)
 * @param resourceType The type of resource to check public sharing permission for
 * @returns boolean indicating if the user can share the resource publicly
 */
export const useCanSharePublic = (resourceType: ResourceType): boolean => {
  const permissionType = resourceToPermissionMap[resourceType];

  const hasPromptsSharePublic = useScopeOverrideFeatureAccess(
    PermissionTypes.PROMPTS,
    Permissions.SHARE_PUBLIC,
  );
  const hasSkillsSharePublic = useScopeOverrideFeatureAccess(
    PermissionTypes.SKILLS,
    Permissions.SHARE_PUBLIC,
  );
  const hasAgentsSharePublic = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.SHARE_PUBLIC,
  });
  const hasMcpSharePublic = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.SHARE_PUBLIC,
  });
  const hasRemoteAgentsSharePublic = useHasAccess({
    permissionType: PermissionTypes.REMOTE_AGENTS,
    permission: Permissions.SHARE_PUBLIC,
  });

  if (!permissionType) {
    return false;
  }

  switch (permissionType) {
    case PermissionTypes.PROMPTS:
      return hasPromptsSharePublic;
    case PermissionTypes.SKILLS:
      return hasSkillsSharePublic;
    case PermissionTypes.AGENTS:
      return hasAgentsSharePublic;
    case PermissionTypes.MCP_SERVERS:
      return hasMcpSharePublic;
    case PermissionTypes.REMOTE_AGENTS:
      return hasRemoteAgentsSharePublic;
    default:
      return false;
  }
};
