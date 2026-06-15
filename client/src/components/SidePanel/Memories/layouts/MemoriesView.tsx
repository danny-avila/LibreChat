import { Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import PageHeader from '~/components/ui/PageHeader';
import { useHasAccess, useLocalize } from '~/hooks';
import MemoryPanel from '../MemoryPanel';

export default function MemoriesView() {
  const localize = useLocalize();
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.READ,
  });

  if (!hasAccess) {
    return <Navigate to="/c/new" replace />;
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <PageHeader title={localize('com_ui_memories')} />
      <div className="flex w-full flex-1 flex-col gap-6 px-6 pb-6">
        <MemoryPanel noPadding />
      </div>
    </main>
  );
}
