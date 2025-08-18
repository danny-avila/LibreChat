import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import {
  useCancelMCPOAuthMutation,
  useUpdateUserPluginsMutation,
  useReinitializeMCPServerMutation,
} from 'librechat-data-provider/react-query';
import type { TUpdateUserPlugins, TPlugin } from 'librechat-data-provider';
import type { ConfigFieldDetail } from '~/components/MCP/MCPConfigDialog';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useMCPSelect } from '~/hooks';

interface ServerState {
  isInitializing: boolean;
  oauthUrl: string | null;
  oauthStartTime: number | null;
  isCancellable: boolean;
  pollInterval: NodeJS.Timeout | null;
}

export function useMCPServerManager() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const mcpSelect = useMCPSelect();
  const { data: startupConfig } = useGetStartupConfig();
  const { mcpValues, setMCPValues, mcpToolDetails, isPinned, setIsPinned } = mcpSelect;
  const queryClient = useQueryClient();

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedToolForConfig, setSelectedToolForConfig] = useState<TPlugin | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mcpValuesRef = useRef(mcpValues);

  // fixes the issue where OAuth flows would deselect all the servers except the one that is being authenticated on success
  useEffect(() => {
    mcpValuesRef.current = mcpValues;
  }, [mcpValues]);

  const configuredServers = useMemo(() => {
    if (!startupConfig?.mcpServers) return [];
    return Object.entries(startupConfig.mcpServers)
      .filter(([, config]) => config.chatMenu !== false)
      .map(([serverName]) => serverName);
  }, [startupConfig?.mcpServers]);

  const reinitializeMutation = useReinitializeMCPServerMutation();
  const cancelOAuthMutation = useCancelMCPOAuthMutation();

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

  const [serverStates, setServerStates] = useState<Record<string, ServerState>>(() => {
    const initialStates: Record<string, ServerState> = {};
    configuredServers.forEach((serverName) => {
      initialStates[serverName] = {
        isInitializing: false,
        oauthUrl: null,
        oauthStartTime: null,
        isCancellable: false,
        pollInterval: null,
      };
    });
    return initialStates;
  });

  const { data: connectionStatusData } = useMCPConnectionStatusQuery({
    enabled: !!startupConfig?.mcpServers && Object.keys(startupConfig.mcpServers).length > 0,
  });
  const connectionStatus = useMemo(
    () => connectionStatusData?.connectionStatus || {},
    [connectionStatusData?.connectionStatus],
  );

  useEffect(() => {
    if (!mcpValues?.length) return;

    const connectedSelected = mcpValues.filter(
      (serverName) => connectionStatus[serverName]?.connectionState === 'connected',
    );

    if (connectedSelected.length !== mcpValues.length) {
      setMCPValues(connectedSelected);
    }
  }, [connectionStatus, mcpValues, setMCPValues]);

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
        clearInterval(state.pollInterval);
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
      const pollInterval = setInterval(async () => {
        try {
          await queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]);

          const freshConnectionData = queryClient.getQueryData([
            QueryKeys.mcpConnectionStatus,
          ]) as any;
          const freshConnectionStatus = freshConnectionData?.connectionStatus || {};

          const state = serverStates[serverName];
          const serverStatus = freshConnectionStatus[serverName];

          if (serverStatus?.connectionState === 'connected') {
            clearInterval(pollInterval);

            showToast({
              message: localize('com_ui_mcp_authenticated_success', { 0: serverName }),
              status: 'success',
            });

            const currentValues = mcpValuesRef.current ?? [];
            if (!currentValues.includes(serverName)) {
              setMCPValues([...currentValues, serverName]);
            }

            await queryClient.invalidateQueries([QueryKeys.tools]);

            // This delay is to ensure UI has updated with new connection status before cleanup
            // Otherwise servers will show as disconnected for a second after OAuth flow completes
            setTimeout(() => {
              cleanupServerState(serverName);
            }, 1000);
            return;
          }

          if (state?.oauthStartTime && Date.now() - state.oauthStartTime > 180000) {
            showToast({
              message: localize('com_ui_mcp_oauth_timeout', { 0: serverName }),
              status: 'error',
            });
            clearInterval(pollInterval);
            cleanupServerState(serverName);
            return;
          }

          if (serverStatus?.connectionState === 'error') {
            showToast({
              message: localize('com_ui_mcp_init_failed'),
              status: 'error',
            });
            clearInterval(pollInterval);
            cleanupServerState(serverName);
            return;
          }
        } catch (error) {
          console.error(`[MCP Manager] Error polling server ${serverName}:`, error);
          clearInterval(pollInterval);
          cleanupServerState(serverName);
          return;
        }
      }, 3500);

      updateServerState(serverName, { pollInterval });
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

        if (response.success) {
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
            await queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]);

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
        } else {
          showToast({
            message: localize('com_ui_mcp_init_failed', { 0: serverName }),
            status: 'error',
          });
          cleanupServerState(serverName);
        }
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
          queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]);

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

        const serverStatus = connectionStatus[serverName];
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
        const serverStatus = connectionStatus[serverName];
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
      const tool = mcpToolDetails?.find((t) => t.name === serverName);
      const serverStatus = connectionStatus[serverName];
      const serverConfig = startupConfig?.mcpServers?.[serverName];

      const handleConfigClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        previousFocusRef.current = document.activeElement as HTMLElement;

        const configTool = tool || {
          name: serverName,
          pluginKey: `${Constants.mcp_prefix}${serverName}`,
          authConfig: serverConfig?.customUserVars
            ? Object.entries(serverConfig.customUserVars).map(([key, config]) => ({
                authField: key,
                label: config.title,
                description: config.description,
              }))
            : [],
          authenticated: false,
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
        tool,
        onConfigClick: handleConfigClick,
        isInitializing: isInitializing(serverName),
        canCancel: isCancellable(serverName),
        onCancel: handleCancelClick,
        hasCustomUserVars,
      };
    },
    [
      mcpToolDetails,
      connectionStatus,
      startupConfig?.mcpServers,
      isInitializing,
      isCancellable,
      cancelOAuthFlow,
    ],
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
      serverStatus: connectionStatus[selectedToolForConfig.name],
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
    configuredServers,
    connectionStatus,
    initializeServer,
    cancelOAuthFlow,
    isInitializing,
    isCancellable,
    getOAuthUrl,
    mcpValues,
    setMCPValues,

    mcpToolDetails,
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
    getServerStatusIconProps,
    getConfigDialogProps,
  };
}
