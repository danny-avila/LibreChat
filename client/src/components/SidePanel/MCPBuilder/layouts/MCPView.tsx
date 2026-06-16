import { Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import PageHeader from '~/components/ui/PageHeader';
import { useHasAccess, useLocalize } from '~/hooks';
import MCPBuilderPanel from '../MCPBuilderPanel';

export default function MCPView() {
  const localize = useLocalize();
  const hasUse = useHasAccess({ permissionType: PermissionTypes.MCP_SERVERS, permission: Permissions.USE });
  const hasCreate = useHasAccess({ permissionType: PermissionTypes.MCP_SERVERS, permission: Permissions.CREATE });
  if (!hasUse && !hasCreate) return <Navigate to="/c/new" replace />;
  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <PageHeader title={localize('com_nav_setting_mcp')} />
      <div className="flex w-full flex-1 flex-col gap-6 p-6">
        <MCPBuilderPanel noPadding />
      </div>
    </main>
  );
}
