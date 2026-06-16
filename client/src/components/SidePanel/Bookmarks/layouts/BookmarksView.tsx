import { Navigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';

export default function BookmarksView() {
  const hasAccess = useHasAccess({ permissionType: PermissionTypes.BOOKMARKS, permission: Permissions.USE });
  if (!hasAccess) return <Navigate to="/c/new" replace />;
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
      <BookmarkPanel />
    </div>
  );
}
