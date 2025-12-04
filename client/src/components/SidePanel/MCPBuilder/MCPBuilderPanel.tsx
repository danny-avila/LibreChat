import { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { Button, Spinner, OGDialogTrigger } from '@librechat/client';
import { useLocalize, useMCPServerManager, useHasAccess } from '~/hooks';
import MCPServerList from './MCPServerList';
import MCPServerDialog from './MCPServerDialog';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import MCPAdminSettings from './MCPAdminSettings';

export default function MCPBuilderPanel() {
  const localize = useLocalize();
  const { availableMCPServers, isLoading, getServerStatusIconProps, getConfigDialogProps } =
    useMCPServerManager();

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CREATE,
  });
  const [showDialog, setShowDialog] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div role="region" aria-label="MCP Builder" className="mt-2 space-y-2">
        {/* Admin Settings Button */}
        <MCPAdminSettings />

        {hasCreateAccess && (
          <MCPServerDialog open={showDialog} onOpenChange={setShowDialog} triggerRef={addButtonRef}>
            <OGDialogTrigger asChild>
              <div className="flex w-full justify-end">
                <Button
                  ref={addButtonRef}
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() => setShowDialog(true)}
                >
                  <Plus className="size-4" aria-hidden />
                  {localize('com_ui_add_mcp')}
                </Button>
              </div>
            </OGDialogTrigger>
          </MCPServerDialog>
        )}

        {/* Server List */}
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <MCPServerList
            servers={availableMCPServers}
            getServerStatusIconProps={getServerStatusIconProps}
          />
        )}
        {(() => {
          const configDialogProps = getConfigDialogProps();
          return configDialogProps && <MCPConfigDialog {...configDialogProps} />;
        })()}
      </div>
    </div>
  );
}
