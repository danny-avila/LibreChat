import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useMCPDeepLink, useHasAccess } from '~/hooks';
import MCPServerDialog from './MCPServerDialog';

export default function MCPDeepLinkDialog() {
  const { isOpen, initialValues, onOpenChange } = useMCPDeepLink();

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CREATE,
  });

  if (!hasCreateAccess || !initialValues) {
    return null;
  }

  return (
    <MCPServerDialog open={isOpen} onOpenChange={onOpenChange} initialValues={initialValues} />
  );
}
