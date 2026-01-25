import { ResourceType, PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';

const resourceToPermissionMap: Record<ResourceType, PermissionTypes> = {
  [ResourceType.AGENT]: PermissionTypes.AGENTS,
  [ResourceType.PROMPTGROUP]: PermissionTypes.PROMPTS,
  [ResourceType.MCPSERVER]: PermissionTypes.MCP_SERVERS,
};

/**
 * Hook to check if a user can share a specific resource type publicly (with everyone)
 * @param resourceType The type of resource to check public sharing permission for
 * @returns boolean indicating if the user can share the resource publicly
 */
export const useCanSharePublic = (resourceType: ResourceType): boolean => {
  const permissionType = resourceToPermissionMap[resourceType];
  const hasAccess = useHasAccess({
    permissionType,
    permission: Permissions.SHARE_PUBLIC,
  });
  return hasAccess;
};
