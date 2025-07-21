import { Constants } from 'librechat-data-provider';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import React, { useState, useCallback, useMemo } from 'react';
import {
  useUpdateUserPluginsMutation,
  useReinitializeMCPServerMutation,
} from 'librechat-data-provider/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TUpdateUserPlugins } from 'librechat-data-provider';
import { Button } from '~/components/ui';
import { useGetStartupConfig } from '~/data-provider';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';
import MCPPanelSkeleton from './MCPPanelSkeleton';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import {
  CustomUserVarsSection,
  ServerInitializationSection,
  type ConfigFieldDetail,
} from '~/components/ui/MCP';

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
  const [selectedServerNameForEditing, setSelectedServerNameForEditing] = useState<string | null>(
    null,
  );
  const [rotatingServers, setRotatingServers] = useState<Set<string>>(new Set());
  const reinitializeMCPMutation = useReinitializeMCPServerMutation();
  const queryClient = useQueryClient();

  // Get real connection status from MCPManager
  const { data: statusQuery } = useMCPConnectionStatusQuery();
  const mcpServerStatuses = useMemo(
    () => statusQuery?.connectionStatus || {},
    [statusQuery?.connectionStatus],
  );

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
    onSuccess: async () => {
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });

      // Wait for all queries to refetch before resolving loading state
      await Promise.all([
        queryClient.invalidateQueries([QueryKeys.tools]),
        queryClient.refetchQueries([QueryKeys.tools]),
        queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]),
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

  const handleSaveServerVars = useCallback(
    (serverName: string, updatedValues: Record<string, string>) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `${Constants.mcp_prefix}${serverName}`,
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
        pluginKey: `${Constants.mcp_prefix}${serverName}`,
        action: 'uninstall', // 'uninstall' action clears the variables
        auth: {}, // Empty auth for uninstall
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

  const handleServerClickToEdit = (serverName: string) => {
    setSelectedServerNameForEditing(serverName);
  };

  const handleGoBackToList = () => {
    setSelectedServerNameForEditing(null);
  };

  const handleReinitializeServer = useCallback(
    async (serverName: string) => {
      setRotatingServers((prev) => new Set(prev).add(serverName));
      try {
        const response = await reinitializeMCPMutation.mutateAsync(serverName);

        // Check if OAuth is required
        if (response.oauthRequired) {
          if (response.authURL) {
            // Show OAuth URL to user
            showToast({
              message: `OAuth required for ${serverName}. Please visit the authorization URL.`,
              status: 'info',
            });

            // Open OAuth URL in new window/tab
            window.open(response.authURL, '_blank', 'noopener,noreferrer');

            // Show a more detailed message with the URL
            setTimeout(() => {
              showToast({
                message: `OAuth URL opened for ${serverName}. Complete authentication and try reinitializing again.`,
                status: 'info',
              });
            }, 1000);
          } else {
            showToast({
              message: `OAuth authentication required for ${serverName}. Please configure OAuth credentials.`,
              status: 'warning',
            });
          }
        } else if (response.oauthCompleted) {
          showToast({
            message:
              response.message ||
              `MCP server '${serverName}' reinitialized successfully after OAuth`,
            status: 'success',
          });
        } else {
          showToast({
            message: response.message || `MCP server '${serverName}' reinitialized successfully`,
            status: 'success',
          });
        }
      } catch (error) {
        console.error('Error reinitializing MCP server:', error);

        // Check if the error response contains OAuth information
        if ((error as any)?.response?.data?.oauthRequired) {
          const errorData = (error as any).response.data;
          if (errorData.authURL) {
            showToast({
              message: `OAuth required for ${serverName}. Please visit the authorization URL.`,
              status: 'info',
            });

            // Open OAuth URL in new window/tab
            window.open(errorData.authURL, '_blank', 'noopener,noreferrer');

            setTimeout(() => {
              showToast({
                message: `OAuth URL opened for ${serverName}. Complete authentication and try reinitializing again.`,
                status: 'info',
              });
            }, 1000);
          } else {
            showToast({
              message: errorData.message || `OAuth authentication required for ${serverName}`,
              status: 'warning',
            });
          }
        } else {
          showToast({
            message: 'Failed to reinitialize MCP server',
            status: 'error',
          });
        }
      } finally {
        setRotatingServers((prev) => {
          const next = new Set(prev);
          next.delete(serverName);
          return next;
        });
      }
    },
    [showToast, reinitializeMCPMutation],
  );

  // Create save and revoke handlers with latest state
  const handleSave = useCallback(
    (updatedValues: Record<string, string>) => {
      if (selectedServerNameForEditing) {
        handleSaveServerVars(selectedServerNameForEditing, updatedValues);
      }
    },
    [selectedServerNameForEditing, handleSaveServerVars],
  );

  const handleRevoke = useCallback(() => {
    if (selectedServerNameForEditing) {
      handleRevokeServerVars(selectedServerNameForEditing);
    }
  }, [selectedServerNameForEditing, handleRevokeServerVars]);

  // Prepare data for MCPConfigDialog
  const selectedServer = useMemo(() => {
    if (!selectedServerNameForEditing) return null;
    return mcpServerDefinitions.find((s) => s.serverName === selectedServerNameForEditing);
  }, [selectedServerNameForEditing, mcpServerDefinitions]);

  const fieldsSchema = useMemo(() => {
    if (!selectedServer) return {};
    const schema: Record<string, ConfigFieldDetail> = {};
    Object.entries(selectedServer.config.customUserVars).forEach(([key, value]) => {
      schema[key] = {
        title: value.title,
        description: value.description,
      };
    });
    return schema;
  }, [selectedServer]);

  const initialValues = useMemo(() => {
    if (!selectedServer) return {};
    // Initialize with empty strings for all fields
    const values: Record<string, string> = {};
    Object.keys(selectedServer.config.customUserVars).forEach((key) => {
      values[key] = '';
    });
    return values;
  }, [selectedServer]);

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

  if (selectedServerNameForEditing && selectedServer) {
    // Editing View - use MCPConfigDialog-style layout but inline
    const serverStatus = mcpServerStatuses[selectedServerNameForEditing];
    const isConnected = serverStatus?.connected || false;
    const requiresOAuth = serverStatus?.requiresOAuth || false;

    return (
      <div className="h-auto max-w-full overflow-x-hidden p-3">
        <Button
          variant="outline"
          onClick={handleGoBackToList}
          className="mb-3 flex items-center px-3 py-2 text-sm"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {localize('com_ui_back')}
        </Button>

        {/* Header with status */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-3">
            <h3 className="text-lg font-medium">
              {localize('com_sidepanel_mcp_variables_for', { '0': selectedServer.serverName })}
            </h3>
            {isConnected && (
              <div className="flex items-center gap-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span>{localize('com_ui_active')}</span>
              </div>
            )}
          </div>
          <p className="text-sm text-text-secondary">
            {Object.keys(fieldsSchema).length > 0
              ? localize('com_ui_mcp_dialog_desc')
              : `Manage connection and settings for the ${selectedServer.serverName} MCP server.`}
          </p>
        </div>

        {/* Content sections */}
        <div className="space-y-6">
          {/* Custom User Variables Section */}
          {Object.keys(fieldsSchema).length > 0 && (
            <div>
              <CustomUserVarsSection
                serverName={selectedServer.serverName}
                fields={fieldsSchema}
                onSave={handleSave}
                onRevoke={handleRevoke}
                isSubmitting={updateUserPluginsMutation.isLoading}
              />
            </div>
          )}

          {/* Server Initialization Section */}
          <ServerInitializationSection
            serverName={selectedServer.serverName}
            requiresOAuth={requiresOAuth}
          />
        </div>
      </div>
    );
  } else {
    // Server List View
    return (
      <div className="h-auto max-w-full overflow-x-hidden p-3">
        <div className="space-y-2">
          {mcpServerDefinitions.map((server) => {
            const serverStatus = mcpServerStatuses[server.serverName];
            const isConnected = serverStatus?.connected || false;

            return (
              <div key={server.serverName} className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1 justify-start dark:hover:bg-gray-700"
                  onClick={() => handleServerClickToEdit(server.serverName)}
                >
                  <div className="flex w-full items-center gap-2">
                    <span>{server.serverName}</span>
                    {isConnected && (
                      <div className="ml-auto flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {localize('com_ui_active')}
                        </span>
                      </div>
                    )}
                  </div>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleReinitializeServer(server.serverName)}
                  className="px-2 py-1"
                  title="Reinitialize MCP server"
                  disabled={reinitializeMCPMutation.isLoading}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${rotatingServers.has(server.serverName) ? 'animate-spin' : ''}`}
                  />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
