import { memo } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess, useLocalize, useReconnectFolder } from '~/hooks';
import { cn } from '~/utils';

export default memo(function LocalFolderBanner() {
  const localize = useLocalize();
  const { needsReconnect, folderName, reconnectFolder } = useReconnectFolder();

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  if (!hasAccess || !needsReconnect) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="local-folder-reconnect-banner"
      className={cn(
        'border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100',
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 xl:max-w-4xl">
        <p>
          {folderName
            ? localize('com_ui_local_folder_reconnect_message', { 0: folderName })
            : localize('com_ui_local_folder_reconnect_message_generic')}
        </p>
        <button
          type="button"
          className="rounded-md bg-amber-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400"
          onClick={() => void reconnectFolder()}
        >
          {localize('com_ui_local_folder_reconnect')}
        </button>
      </div>
    </div>
  );
});
