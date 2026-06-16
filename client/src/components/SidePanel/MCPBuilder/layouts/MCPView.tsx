import { Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';
import MCPBuilderPanel from '~/components/SidePanel/MCPBuilder/MCPBuilderPanel';

export default function MCPView() {
  const hasUse = useHasAccess({ permissionType: PermissionTypes.MCP_SERVERS, permission: Permissions.USE });
  const hasCreate = useHasAccess({ permissionType: PermissionTypes.MCP_SERVERS, permission: Permissions.CREATE });
  if (!hasUse && !hasCreate) return <Navigate to="/c/new" replace />;
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
      <MCPBuilderPanel />
    </div>
  );
}
