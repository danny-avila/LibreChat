import React, { useState, useCallback, useMemo } from 'react';
import { useGetStartupConfig } from '~/data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TUpdateUserPlugins } from 'librechat-data-provider';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import MCPPanelSkeleton from './MCPPanelSkeleton';
import MCPConfigDialog, { type ConfigFieldDetail } from '~/components/ui/MCPConfigDialog';

interface ServerConfigWithVars {
  serverName: string;
  config: {
    customUserVars: Record<string, { title: string; description: string }>;
  };
}

export default function MCPPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig, isLoading: startupConfigLoading } = useGetStartupConfig();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<ServerConfigWithVars | null>(null);

  const mcpServerDefinitions = useMemo(() => {
    if (!startupConfig?.mcpServers) {
      return [];
    }
    return Object.entries(startupConfig.mcpServers)
      .filter(
        ([, serverConfig]) =>
          serverConfig.customUserVars && Object.keys(serverConfig.customUserVars).length > 0,
      )
      .map(([serverName, config]) => ({
        serverName,
        iconPath: null,
        config: {
          ...config,
          customUserVars: config.customUserVars ?? {},
        },
      }));
  }, [startupConfig?.mcpServers]);

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: () => {
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });
      setIsDialogOpen(false);
    },
    onError: (error) => {
      console.error('Error updating MCP custom user variables:', error);
      showToast({
        message: localize('com_nav_mcp_vars_update_error'),
        status: 'error',
      });
    },
  });

  const handleSaveServerVars = useCallback(
    (serverName: string, updatedValues: Record<string, string>) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `mcp_${serverName}`,
        action: 'install', // 'install' action is used to set/update credentials/variables
        auth: updatedValues,
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

  const handleRevokeServerVars = useCallback(
    (serverName: string) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `mcp_${serverName}`,
        action: 'uninstall', // 'uninstall' action clears the variables
        auth: {}, // Empty auth for uninstall
      };
      updateUserPluginsMutation.mutate(payload);
      // Optionally close dialog or show success message after mutation.onSuccess
    },
    [updateUserPluginsMutation],
  );

  const handleServerClick = (server: ServerConfigWithVars) => {
    setSelectedServer(server);
    setIsDialogOpen(true);
  };

  if (startupConfigLoading) {
    return <MCPPanelSkeleton />;
  }

  if (mcpServerDefinitions.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        {localize('com_sidepanel_mcp_no_servers_with_vars')}
      </div>
    );
  }

  return (
    <div className="h-auto max-w-full overflow-x-hidden p-3">
      <div className="space-y-2">
        {mcpServerDefinitions.map((server) => (
          <Button
            key={server.serverName}
            variant="outline"
            className="w-full justify-start dark:hover:bg-gray-700"
            onClick={() => handleServerClick(server)}
          >
            {server.serverName}
          </Button>
        ))}
      </div>
      {selectedServer && (
        <MCPConfigDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          fieldsSchema={selectedServer.config.customUserVars as Record<string, ConfigFieldDetail>}
          initialValues={
            Object.keys(selectedServer.config.customUserVars).reduce((acc, key) => {
              acc[key] = ''; // Initialize with empty strings
              return acc;
            }, {})
          }
          onSave={(updatedValues) => {
            if (selectedServer) {
              handleSaveServerVars(selectedServer.serverName, updatedValues);
            }
          }}
          onRevoke={() => {
            if (selectedServer) {
              handleRevokeServerVars(selectedServer.serverName);
            }
          }}
          isSubmitting={updateUserPluginsMutation.isLoading}
        />
      )}
    </div>
  );
}
