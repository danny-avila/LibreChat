import { useState, useRef, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { Button, Spinner, OGDialogTrigger, Input } from '@librechat/client';
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
  const [searchQuery, setSearchQuery] = useState('');
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const configDialogProps = getConfigDialogProps();

  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableMCPServers;
    }
    const query = searchQuery.toLowerCase();
    return availableMCPServers.filter((server) => {
      const displayName = server.config?.title || server.serverName;
      return (
        displayName.toLowerCase().includes(query) || server.serverName.toLowerCase().includes(query)
      );
    });
  }, [availableMCPServers, searchQuery]);

  return (
    <div className="flex h-full w-full flex-col overflow-visible">
      <div role="region" aria-label="MCP Builder" className="mt-2 space-y-2">
        {/* Admin Settings Button */}
        <MCPAdminSettings />

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={localize('com_ui_filter_mcp_servers')}
            className="pl-9"
            aria-label={localize('com_ui_filter_mcp_servers')}
          />
        </div>

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
            servers={filteredServers}
            getServerStatusIconProps={getServerStatusIconProps}
            isFiltered={searchQuery.trim().length > 0}
          />
        )}
        {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
      </div>
    </div>
  );
}
