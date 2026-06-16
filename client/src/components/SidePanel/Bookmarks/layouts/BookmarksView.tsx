import { Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import PageHeader from '~/components/ui/PageHeader';
import { useHasAccess, useLocalize } from '~/hooks';
import BookmarkPanel from '../BookmarkPanel';

export default function BookmarksView() {
  const localize = useLocalize();
  const hasAccess = useHasAccess({ permissionType: PermissionTypes.BOOKMARKS, permission: Permissions.USE });
  if (!hasAccess) return <Navigate to="/c/new" replace />;
  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <PageHeader title={localize('com_sidepanel_conversation_tags')} />
      <div className="flex w-full flex-1 flex-col gap-6 px-6 pb-6">
        <BookmarkPanel noPadding />
      </div>
    </main>
  );
}
