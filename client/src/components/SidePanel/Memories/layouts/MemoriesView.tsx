import { Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';
import { MemoryPanel } from '~/components/SidePanel/Memories';

export default function MemoriesView() {
  const hasUse = useHasAccess({ permissionType: PermissionTypes.MEMORIES, permission: Permissions.USE });
  const hasRead = useHasAccess({ permissionType: PermissionTypes.MEMORIES, permission: Permissions.READ });
  if (!hasUse || !hasRead) return <Navigate to="/c/new" replace />;
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
      <MemoryPanel />
    </div>
  );
}
