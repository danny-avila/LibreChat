import { memo } from 'react';
import { FolderOpen, FolderPlus, FolderSync } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useDirectoryHandle, useHasAccess, useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ConnectFolderButtonProps = {
  disabled?: boolean;
};

export default memo(function ConnectFolderButton({ disabled = false }: ConnectFolderButtonProps) {
  const localize = useLocalize();
  const {
    status,
    folderName,
    isSupported,
    connectFolder,
    disconnectFolder,
    reconnectFolder,
    isConnected,
    needsReconnect,
  } = useDirectoryHandle();

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  if (!hasAccess) {
    return null;
  }

  if (!isSupported) {
    return (
      <TooltipAnchor
        description={localize('com_ui_local_folder_unsupported')}
        render={
          <button
            type="button"
            aria-label={localize('com_ui_local_folder_unsupported')}
            data-testid="connect-folder-unsupported"
            disabled
            className="cursor-not-allowed rounded-full p-1.5 text-text-secondary opacity-30"
          >
            <FolderPlus size={22} aria-hidden="true" />
          </button>
        }
      />
    );
  }

  const isDisabled = disabled || status === 'loading';

  let tooltipKey = 'com_ui_local_folder_connect';
  let ariaLabelKey = 'com_ui_local_folder_connect';
  let icon = <FolderPlus size={22} aria-hidden="true" />;
  let onClick = () => void connectFolder();

  if (needsReconnect) {
    tooltipKey = 'com_ui_local_folder_reconnect';
    ariaLabelKey = 'com_ui_local_folder_reconnect';
    icon = <FolderSync size={22} aria-hidden="true" />;
    onClick = () => void reconnectFolder();
  } else if (isConnected && folderName) {
    tooltipKey = 'com_ui_local_folder_connected';
    ariaLabelKey = 'com_ui_local_folder_disconnect';
    icon = <FolderOpen size={22} aria-hidden="true" />;
    onClick = () => void disconnectFolder();
  }

  const tooltip =
    isConnected && folderName ? localize(tooltipKey, { 0: folderName }) : localize(tooltipKey);

  return (
    <TooltipAnchor
      description={tooltip}
      render={
        <button
          type="button"
          aria-label={localize(ariaLabelKey)}
          data-testid="connect-folder-button"
          disabled={isDisabled}
          className={cn(
            'rounded-full p-1.5 text-text-secondary outline-offset-4 transition-all duration-200 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30',
            needsReconnect && 'text-amber-600 hover:text-amber-700 dark:text-amber-400',
            isConnected && 'text-green-600 hover:text-green-700 dark:text-green-400',
          )}
          onClick={onClick}
        >
          {icon}
        </button>
      }
    />
  );
});
