import React, { useState, useMemo, useCallback } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, useToastContext } from '@librechat/client';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TUpdateUserPlugins } from 'librechat-data-provider';
import ServerInitializationSection from '~/components/MCP/ServerInitializationSection';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';
import CustomUserVarsSection from '~/components/MCP/CustomUserVarsSection';
import BadgeRowProvider from '~/Providers/BadgeRowContext';
import { useGetStartupConfig } from '~/data-provider';
import MCPPanelSkeleton from './MCPPanelSkeleton';
import { useLocalize } from '~/hooks';

function MCPPanelContent() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();
  const { data: startupConfig, isLoading: startupConfigLoading } = useGetStartupConfig();
  const { data: connectionStatusData } = useMCPConnectionStatusQuery();
  const [selectedServerNameForEditing, setSelectedServerNameForEditing] = useState<string | null>(
    null,
  );

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: async () => {
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });

      await Promise.all([
        queryClient.refetchQueries([QueryKeys.tools]),
        queryClient.refetchQueries([QueryKeys.mcpAuthValues]),
        queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]),
      ]);
    },
    onError: (error: unknown) => {
      console.error('Error updating MCP auth:', error);
      showToast({
        message: localize('com_nav_mcp_vars_update_error'),
        status: 'error',
      });
    },
  });

  const mcpServerDefinitions = useMemo(() => {
    if (!startupConfig?.mcpServers) {
      return [];
    }
    return Object.entries(startupConfig.mcpServers).map(([serverName, config]) => ({
      serverName,
      iconPath: null,
      config: {
        ...config,
        customUserVars: config.customUserVars ?? {},
      },
    }));
  }, [startupConfig?.mcpServers]);

  const connectionStatus = useMemo(
    () => connectionStatusData?.connectionStatus || {},
    [connectionStatusData?.connectionStatus],
  );

  const handleServerClickToEdit = (serverName: string) => {
    setSelectedServerNameForEditing(serverName);
  };

  const handleGoBackToList = () => {
    setSelectedServerNameForEditing(null);
  };

  const handleConfigSave = useCallback(
    (targetName: string, authData: Record<string, string>) => {
      console.log(
        `[MCP Panel] Saving config for ${targetName}, pluginKey: ${`${Constants.mcp_prefix}${targetName}`}`,
      );
      const payload: TUpdateUserPlugins = {
        pluginKey: `${Constants.mcp_prefix}${targetName}`,
        action: 'install',
        auth: authData,
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

  const handleConfigRevoke = useCallback(
    (targetName: string) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `${Constants.mcp_prefix}${targetName}`,
        action: 'uninstall',
        auth: {},
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

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

  if (selectedServerNameForEditing) {
    // Editing View
    const serverBeingEdited = mcpServerDefinitions.find(
      (s) => s.serverName === selectedServerNameForEditing,
    );

    if (!serverBeingEdited) {
      // Fallback to list view if server not found
      setSelectedServerNameForEditing(null);
      return (
        <div className="p-4 text-center text-sm text-gray-500">
          {localize('com_ui_error')}: {localize('com_ui_mcp_server_not_found')}
        </div>
      );
    }

    const serverStatus = connectionStatus[selectedServerNameForEditing];

    return (
      <div className="h-auto max-w-full space-y-4 overflow-x-hidden py-2">
        <Button variant="outline" onClick={handleGoBackToList} size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {localize('com_ui_back')}
        </Button>

        <div className="mb-4">
          <CustomUserVarsSection
            serverName={selectedServerNameForEditing}
            fields={serverBeingEdited.config.customUserVars}
            onSave={(authData) => {
              if (selectedServerNameForEditing) {
                handleConfigSave(selectedServerNameForEditing, authData);
              }
            }}
            onRevoke={() => {
              if (selectedServerNameForEditing) {
                handleConfigRevoke(selectedServerNameForEditing);
              }
            }}
            isSubmitting={updateUserPluginsMutation.isLoading}
          />
        </div>

        <ServerInitializationSection
          sidePanel={true}
          serverName={selectedServerNameForEditing}
          requiresOAuth={serverStatus?.requiresOAuth || false}
          hasCustomUserVars={
            serverBeingEdited.config.customUserVars &&
            Object.keys(serverBeingEdited.config.customUserVars).length > 0
          }
        />
      </div>
    );
  } else {
    // Server List View
    return (
      <div className="h-auto max-w-full overflow-x-hidden py-2">
        <div className="space-y-2">
          {mcpServerDefinitions.map((server) => {
            const serverStatus = connectionStatus[server.serverName];
            const isConnected = serverStatus?.connectionState === 'connected';

            return (
              <div key={server.serverName} className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1 justify-start dark:hover:bg-gray-700"
                  onClick={() => handleServerClickToEdit(server.serverName)}
                >
                  <div className="flex items-center gap-2">
                    <span>{server.serverName}</span>
                    {serverStatus && (
                      <span
                        className={`rounded-xl px-2 py-0.5 text-xs ${
                          isConnected
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {serverStatus.connectionState}
                      </span>
                    )}
                  </div>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}

export default function MCPPanel() {
  return (
    <BadgeRowProvider>
      <MCPPanelContent />
    </BadgeRowProvider>
  );
}
