import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { MCPDeepLinkResult } from '~/hooks';
import MCPServerDialog from './MCPServerDialog';
import { useHasAccess } from '~/hooks';

export default function MCPDeepLinkDialog({
  isOpen,
  initialValues,
  onOpenChange,
}: MCPDeepLinkResult) {
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CREATE,
  });
  const hasUseAccess = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });

  if (!hasCreateAccess || !hasUseAccess) {
    return null;
  }

  return (
    <MCPServerDialog open={isOpen} onOpenChange={onOpenChange} initialValues={initialValues} />
  );
}
