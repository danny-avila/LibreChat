import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys, MCPOptions, ResourceType } from 'librechat-data-provider';
import {
  useCancelMCPOAuthMutation,
  useUpdateUserPluginsMutation,
  useReinitializeMCPServerMutation,
  useGetAllEffectivePermissionsQuery,
} from 'librechat-data-provider/react-query';
import type { TUpdateUserPlugins, TPlugin, MCPServersResponse } from 'librechat-data-provider';
import type { ConfigFieldDetail } from '~/common';
import { useLocalize, useMCPSelect, useMCPConnectionStatus } from '~/hooks';
import { useGetStartupConfig, useMCPServersQuery } from '~/data-provider';

export interface MCPServerDefinition {
  serverName: string;
  config: MCPOptions;
  dbId?: string; // MongoDB ObjectId for database servers (used for permissions)
  effectivePermissions: number; // Permission bits (VIEW=1, EDIT=2, DELETE=4, SHARE=8)
  consumeOnly?: boolean;
}

interface ServerState {
  isInitializing: boolean;
  oauthUrl: string | null;
  oauthStartTime: number | null;
  isCancellable: boolean;
  pollInterval: NodeJS.Timeout | null;
}

export function useMCPServerManager({ conversationId }: { conversationId?: string | null } = {}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig(); // Keep for UI config only

  const { data: loadedServers, isLoading } = useMCPServersQuery();

  // Fetch effective permissions for all MCP servers
  const { data: permissionsMap } = useGetAllEffectivePermissionsQuery(ResourceType.MCPSERVER);

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedToolForConfig, setSelectedToolForConfig] = useState<TPlugin | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const availableMCPServers: MCPServerDefinition[] = useMemo<MCPServerDefinition[]>(() => {
    const definitions: MCPServerDefinition[] = [];
    if (loadedServers) {
      for (const [serverName, metadata] of Object.entries(loadedServers)) {
        const { dbId, consumeOnly, ...config } = metadata;

        // Get effective permissions from the permissions map using _id
        // Fall back to 1 (VIEW) for YAML-based servers without _id
        const effectivePermissions = dbId && permissionsMap?.[dbId] ? permissionsMap[dbId] : 1;

        definitions.push({
          serverName,
          dbId,
          effectivePermissions,
          consumeOnly,
          config,
        });
      }
    }
    return definitions;
  }, [loadedServers, permissionsMap]);

  // Memoize filtered servers for useMCPSelect to prevent infinite loops
  const selectableServers = useMemo(
    () => availableMCPServers.filter((s) => s.config.chatMenu !== false && !s.consumeOnly),
    [availableMCPServers],
  );

  const { mcpValues, setMCPValues, isPinned, setIsPinned } = useMCPSelect({
    conversationId,
    servers: selectableServers,
  });
  const mcpValuesRef = useRef(mcpValues);

  // fixes the issue where OAuth flows would deselect all the servers except the one that is being authenticated on success
  useEffect(() => {
    mcpValuesRef.current = mcpValues;
  }, [mcpValues]);

  // Check if specific permission bit is set
  const checkEffectivePermission = useCallback(
    (effectivePermissions: number, permissionBit: number): boolean => {
      return (effectivePermissions & permissionBit) !== 0;
    },
    [],
  );

  const reinitializeMutation = useReinitializeMCPServerMutation();
  const cancelOAuthMutation = useCancelMCPOAuthMutation();

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: async () => {
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });

      await Promise.all([
        queryClient.invalidateQueries([QueryKeys.mcpServers]),
        queryClient.invalidateQueries([QueryKeys.mcpTools]),
        queryClient.invalidateQueries([QueryKeys.mcpAuthValues]),
        queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]),
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

  const [serverStates, setServerStates] = useState<Record<string, ServerState>>(() => {
    const initialStates: Record<string, ServerState> = {};
    availableMCPServers.forEach((server) => {
      initialStates[server.serverName] = {
        isInitializing: false,
        oauthUrl: null,
        oauthStartTime: null,
        isCancellable: false,
        pollInterval: null,
      };
    });
    return initialStates;
  });

  const { connectionStatus } = useMCPConnectionStatus({
    enabled: !isLoading && availableMCPServers.length > 0,
  });

  const updateServerState = useCallback((serverName: string, updates: Partial<ServerState>) => {
    setServerStates((prev) => {
      const newStates = { ...prev };
      const currentState = newStates[serverName] || {
        isInitializing: false,
        oauthUrl: null,
        oauthStartTime: null,
        isCancellable: false,
        pollInterval: null,
      };
      newStates[serverName] = { ...currentState, ...updates };
      return newStates;
    });
  }, []);

  const cleanupServerState = useCallback(
    (serverName: string) => {
      const state = serverStates[serverName];
      if (state?.pollInterval) {
        clearTimeout(state.pollInterval);
      }
      updateServerState(serverName, {
        isInitializing: false,
        oauthUrl: null,
        oauthStartTime: null,
        isCancellable: false,
        pollInterval: null,
      });
    },
    [serverStates, updateServerState],
  );

  const startServerPolling = useCallback(
    (serverName: string) => {
      // Prevent duplicate polling for the same server
      const existingState = serverStates[serverName];
      if (existingState?.pollInterval) {
        console.debug(`[MCP Manager] Polling already active for ${serverName}, skipping duplicate`);
        return;
      }

      let pollAttempts = 0;
      let timeoutId: NodeJS.Timeout | null = null;

      /** OAuth typically completes in 5 seconds to 3 minutes
       * We enforce a strict 3-minute timeout with gradual backoff
       */
      const getPollInterval = (attempt: number): number => {
        if (attempt < 12) return 5000; // First minute: every 5s (12 polls)
        if (attempt < 22) return 6000; // Second minute: every 6s (10 polls)
        return 7500; // Final minute: every 7.5s (8 polls)
      };

      const maxAttempts = 30; // Exactly 3 minutes (180 seconds) total
      const OAUTH_TIMEOUT_MS = 180000; // 3 minutes in milliseconds

      const pollOnce = async () => {
        try {
          pollAttempts++;
          const state = serverStates[serverName];

          /** Stop polling after 3 minutes or max attempts */
          const elapsedTime = state?.oauthStartTime
            ? Date.now() - state.oauthStartTime
            : pollAttempts * 5000; // Rough estimate if no start time

          if (pollAttempts > maxAttempts || elapsedTime > OAUTH_TIMEOUT_MS) {
            console.warn(
              `[MCP Manager] OAuth timeout for ${serverName} after ${(elapsedTime / 1000).toFixed(0)}s (attempt ${pollAttempts})`,
            );
            showToast({
              message: localize('com_ui_mcp_oauth_timeout', { 0: serverName }),
              status: 'error',
            });
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            cleanupServerState(serverName);
            return;
          }

          await queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]);

          const freshConnectionData = queryClient.getQueryData([
            QueryKeys.mcpConnectionStatus,
          ]) as any;
          const freshConnectionStatus = freshConnectionData?.connectionStatus || {};

          const serverStatus = freshConnectionStatus[serverName];

          if (serverStatus?.connectionState === 'connected') {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }

            showToast({
              message: localize('com_ui_mcp_authenticated_success', { 0: serverName }),
              status: 'success',
            });

            const currentValues = mcpValuesRef.current ?? [];
            if (!currentValues.includes(serverName)) {
              setMCPValues([...currentValues, serverName]);
            }

            await queryClient.invalidateQueries([QueryKeys.mcpTools]);

            // This delay is to ensure UI has updated with new connection status before cleanup
            // Otherwise servers will show as disconnected for a second after OAuth flow completes
            setTimeout(() => {
              cleanupServerState(serverName);
            }, 1000);
            return;
          }

          // Check for OAuth timeout (should align with maxAttempts)
          if (state?.oauthStartTime && Date.now() - state.oauthStartTime > OAUTH_TIMEOUT_MS) {
            showToast({
              message: localize('com_ui_mcp_oauth_timeout', { 0: serverName }),
              status: 'error',
            });
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            cleanupServerState(serverName);
            return;
          }

          if (serverStatus?.connectionState === 'error') {
            showToast({
              message: localize('com_ui_mcp_init_failed'),
              status: 'error',
            });
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            cleanupServerState(serverName);
            return;
          }

          // Schedule next poll with smart intervals based on OAuth timing
          const nextInterval = getPollInterval(pollAttempts);

          // Log progress periodically
          if (pollAttempts % 5 === 0 || pollAttempts <= 2) {
            console.debug(
              `[MCP Manager] Polling ${serverName} attempt ${pollAttempts}/${maxAttempts}, next in ${nextInterval / 1000}s`,
            );
          }

          timeoutId = setTimeout(pollOnce, nextInterval);
          updateServerState(serverName, { pollInterval: timeoutId });
        } catch (error) {
          console.error(`[MCP Manager] Error polling server ${serverName}:`, error);
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          cleanupServerState(serverName);
          return;
        }
      };

      // Start the first poll
      timeoutId = setTimeout(pollOnce, getPollInterval(0));
      updateServerState(serverName, { pollInterval: timeoutId });
    },
    [
      queryClient,
      serverStates,
      showToast,
      localize,
      setMCPValues,
      cleanupServerState,
      updateServerState,
    ],
  );

  const initializeServer = useCallback(
    async (serverName: string, autoOpenOAuth: boolean = true) => {
      updateServerState(serverName, { isInitializing: true });
      try {
        const response = await reinitializeMutation.mutateAsync(serverName);
        if (!response.success) {
          showToast({
            message: localize('com_ui_mcp_init_failed', { 0: serverName }),
            status: 'error',
          });
          cleanupServerState(serverName);
          return response;
        }

        if (response.oauthRequired && response.oauthUrl) {
          updateServerState(serverName, {
            oauthUrl: response.oauthUrl,
            oauthStartTime: Date.now(),
            isCancellable: true,
            isInitializing: true,
          });

          if (autoOpenOAuth) {
            window.open(response.oauthUrl, '_blank', 'noopener,noreferrer');
          }

          startServerPolling(serverName);
        } else {
          await Promise.all([
            queryClient.invalidateQueries([QueryKeys.mcpServers]),
            queryClient.invalidateQueries([QueryKeys.mcpTools]),
            queryClient.invalidateQueries([QueryKeys.mcpAuthValues]),
            queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]),
          ]);

          showToast({
            message: localize('com_ui_mcp_initialized_success', { 0: serverName }),
            status: 'success',
          });

          const currentValues = mcpValues ?? [];
          if (!currentValues.includes(serverName)) {
            setMCPValues([...currentValues, serverName]);
          }

          cleanupServerState(serverName);
        }
        return response;
      } catch (error) {
        console.error(`[MCP Manager] Failed to initialize ${serverName}:`, error);
        showToast({
          message: localize('com_ui_mcp_init_failed', { 0: serverName }),
          status: 'error',
        });
        cleanupServerState(serverName);
      }
    },
    [
      updateServerState,
      reinitializeMutation,
      startServerPolling,
      queryClient,
      showToast,
      localize,
      mcpValues,
      cleanupServerState,
      setMCPValues,
    ],
  );

  const cancelOAuthFlow = useCallback(
    (serverName: string) => {
      cancelOAuthMutation.mutate(serverName, {
        onSuccess: () => {
          cleanupServerState(serverName);
          Promise.all([
            queryClient.invalidateQueries([QueryKeys.mcpServers]),
            queryClient.invalidateQueries([QueryKeys.mcpTools]),
            queryClient.invalidateQueries([QueryKeys.mcpAuthValues]),
            queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]),
          ]);

          showToast({
            message: localize('com_ui_mcp_oauth_cancelled', { 0: serverName }),
            status: 'warning',
          });
        },
        onError: (error) => {
          console.error(`[MCP Manager] Failed to cancel OAuth for ${serverName}:`, error);
          showToast({
            message: localize('com_ui_mcp_init_failed', { 0: serverName }),
            status: 'error',
          });
        },
      });
    },
    [queryClient, cleanupServerState, showToast, localize, cancelOAuthMutation],
  );

  const isInitializing = useCallback(
    (serverName: string) => {
      return serverStates[serverName]?.isInitializing || false;
    },
    [serverStates],
  );

  const isCancellable = useCallback(
    (serverName: string) => {
      return serverStates[serverName]?.isCancellable || false;
    },
    [serverStates],
  );

  const getOAuthUrl = useCallback(
    (serverName: string) => {
      return serverStates[serverName]?.oauthUrl || null;
    },
    [serverStates],
  );

  const placeholderText = useMemo(
    () => startupConfig?.interface?.mcpServers?.placeholder || localize('com_ui_mcp_servers'),
    [startupConfig?.interface?.mcpServers?.placeholder, localize],
  );

  const batchToggleServers = useCallback(
    (serverNames: string[]) => {
      const connectedServers: string[] = [];
      const disconnectedServers: string[] = [];

      serverNames.forEach((serverName) => {
        if (isInitializing(serverName)) {
          return;
        }

        const serverStatus = connectionStatus?.[serverName];
        if (serverStatus?.connectionState === 'connected') {
          connectedServers.push(serverName);
        } else {
          disconnectedServers.push(serverName);
        }
      });

      setMCPValues(connectedServers);

      disconnectedServers.forEach((serverName) => {
        initializeServer(serverName);
      });
    },
    [connectionStatus, setMCPValues, initializeServer, isInitializing],
  );

  const toggleServerSelection = useCallback(
    (serverName: string) => {
      if (isInitializing(serverName)) {
        return;
      }

      const currentValues = mcpValues ?? [];
      const isCurrentlySelected = currentValues.includes(serverName);

      if (isCurrentlySelected) {
        const filteredValues = currentValues.filter((name) => name !== serverName);
        setMCPValues(filteredValues);
      } else {
        const serverStatus = connectionStatus?.[serverName];
        if (serverStatus?.connectionState === 'connected') {
          setMCPValues([...currentValues, serverName]);
        } else {
          initializeServer(serverName);
        }
      }
    },
    [mcpValues, setMCPValues, connectionStatus, initializeServer, isInitializing],
  );

  const handleConfigSave = useCallback(
    (targetName: string, authData: Record<string, string>) => {
      if (selectedToolForConfig && selectedToolForConfig.name === targetName) {
        const payload: TUpdateUserPlugins = {
          pluginKey: `${Constants.mcp_prefix}${targetName}`,
          action: 'install',
          auth: authData,
        };
        updateUserPluginsMutation.mutate(payload);
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation],
  );

  const handleConfigRevoke = useCallback(
    (targetName: string) => {
      if (selectedToolForConfig && selectedToolForConfig.name === targetName) {
        const payload: TUpdateUserPlugins = {
          pluginKey: `${Constants.mcp_prefix}${targetName}`,
          action: 'uninstall',
          auth: {},
        };
        updateUserPluginsMutation.mutate(payload);

        const currentValues = mcpValues ?? [];
        const filteredValues = currentValues.filter((name) => name !== targetName);
        setMCPValues(filteredValues);
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation, mcpValues, setMCPValues],
  );

  /** Standalone revoke function for OAuth servers - doesn't require selectedToolForConfig */
  const revokeOAuthForServer = useCallback(
    (serverName: string) => {
      const payload: TUpdateUserPlugins = {
        pluginKey: `${Constants.mcp_prefix}${serverName}`,
        action: 'uninstall',
        auth: {},
      };
      updateUserPluginsMutation.mutate(payload);
    },
    [updateUserPluginsMutation],
  );

  const handleSave = useCallback(
    (authData: Record<string, string>) => {
      if (selectedToolForConfig) {
        handleConfigSave(selectedToolForConfig.name, authData);
      }
    },
    [selectedToolForConfig, handleConfigSave],
  );

  const handleRevoke = useCallback(() => {
    if (selectedToolForConfig) {
      handleConfigRevoke(selectedToolForConfig.name);
    }
  }, [selectedToolForConfig, handleConfigRevoke]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsConfigModalOpen(open);

    if (!open && previousFocusRef.current) {
      setTimeout(() => {
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          previousFocusRef.current.focus();
        }
        previousFocusRef.current = null;
      }, 0);
    }
  }, []);

  const getServerStatusIconProps = useCallback(
    (serverName: string) => {
      const mcpData = queryClient.getQueryData<MCPServersResponse | undefined>([
        QueryKeys.mcpTools,
      ]);
      const serverData = mcpData?.servers?.[serverName];
      const serverStatus = connectionStatus?.[serverName];
      const serverConfig = loadedServers?.[serverName];

      const handleConfigClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        previousFocusRef.current = document.activeElement as HTMLElement;

        /** Minimal TPlugin object for the config dialog */
        const configTool: TPlugin = {
          name: serverName,
          pluginKey: `${Constants.mcp_prefix}${serverName}`,
          authConfig:
            serverData?.authConfig ||
            (serverConfig?.customUserVars
              ? Object.entries(serverConfig.customUserVars).map(([key, config]) => ({
                  authField: key,
                  label: config.title,
                  description: config.description,
                }))
              : []),
          authenticated: serverData?.authenticated ?? false,
        };
        setSelectedToolForConfig(configTool);
        setIsConfigModalOpen(true);
      };

      const handleCancelClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        cancelOAuthFlow(serverName);
      };

      const hasCustomUserVars =
        serverConfig?.customUserVars && Object.keys(serverConfig.customUserVars).length > 0;

      return {
        serverName,
        serverStatus,
        tool: serverData
          ? ({
              name: serverName,
              pluginKey: `${Constants.mcp_prefix}${serverName}`,
              icon: serverData.icon,
              authenticated: serverData.authenticated,
            } as TPlugin)
          : undefined,
        onConfigClick: handleConfigClick,
        isInitializing: isInitializing(serverName),
        canCancel: isCancellable(serverName),
        onCancel: handleCancelClick,
        hasCustomUserVars,
      };
    },
    [queryClient, isCancellable, isInitializing, cancelOAuthFlow, connectionStatus, loadedServers],
  );

  const getConfigDialogProps = useCallback(() => {
    if (!selectedToolForConfig) return null;

    const fieldsSchema: Record<string, ConfigFieldDetail> = {};
    if (selectedToolForConfig?.authConfig) {
      selectedToolForConfig.authConfig.forEach((field) => {
        fieldsSchema[field.authField] = {
          title: field.label || field.authField,
          description: field.description,
        };
      });
    }

    const initialValues: Record<string, string> = {};
    if (selectedToolForConfig?.authConfig) {
      selectedToolForConfig.authConfig.forEach((field) => {
        initialValues[field.authField] = '';
      });
    }

    return {
      serverName: selectedToolForConfig.name,
      serverStatus: connectionStatus?.[selectedToolForConfig.name],
      isOpen: isConfigModalOpen,
      onOpenChange: handleDialogOpenChange,
      fieldsSchema,
      initialValues,
      onSave: handleSave,
      onRevoke: handleRevoke,
      isSubmitting: updateUserPluginsMutation.isLoading,
    };
  }, [
    selectedToolForConfig,
    connectionStatus,
    isConfigModalOpen,
    handleDialogOpenChange,
    handleSave,
    handleRevoke,
    updateUserPluginsMutation.isLoading,
  ]);

  return {
    availableMCPServers,
    /** MCP servers filtered for chat menu selection (chatMenu !== false && !consumeOnly) */
    selectableServers,
    availableMCPServersMap: loadedServers,
    isLoading,
    connectionStatus,
    initializeServer,
    cancelOAuthFlow,
    isInitializing,
    isCancellable,
    getOAuthUrl,
    mcpValues,
    setMCPValues,

    isPinned,
    setIsPinned,
    placeholderText,
    batchToggleServers,
    toggleServerSelection,
    localize,

    isConfigModalOpen,
    handleDialogOpenChange,
    selectedToolForConfig,
    setSelectedToolForConfig,
    handleSave,
    handleRevoke,
    revokeOAuthForServer,
    getServerStatusIconProps,
    getConfigDialogProps,
    checkEffectivePermission,
  };
}
