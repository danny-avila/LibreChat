import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useToastContext } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Constants,
  QueryKeys,
  MCPOptions,
  Permissions,
  ResourceType,
  PermissionTypes,
} from 'librechat-data-provider';
import {
  useCancelMCPOAuthMutation,
  useUpdateUserPluginsMutation,
  useReinitializeMCPServerMutation,
  useGetAllEffectivePermissionsQuery,
} from 'librechat-data-provider/react-query';
import type {
  TUpdateUserPlugins,
  TPlugin,
  MCPServersResponse,
  MCPConnectionStatusResponse,
} from 'librechat-data-provider';
import type { MCPServerInitState } from '~/store/mcp';
import type { ConfigFieldDetail } from '~/common';
import { useLocalize, useHasAccess, useMCPSelect, useMCPConnectionStatus } from '~/hooks';
import { useGetStartupConfig, useMCPServersQuery } from '~/data-provider';
import { mcpServerInitStatesAtom, getServerInitState } from '~/store/mcp';

export interface MCPServerDefinition {
  serverName: string;
  config: MCPOptions;
  dbId?: string; // MongoDB ObjectId for database servers (used for permissions)
  effectivePermissions: number; // Permission bits (VIEW=1, EDIT=2, DELETE=4, SHARE=8)
  consumeOnly?: boolean;
}

// Poll intervals are kept local since they're timer references that can't be serialized
// The init states (isInitializing, isCancellable, etc.) are stored in the global Jotai atom
type PollIntervals = Record<string, NodeJS.Timeout | null>;

export function useMCPServerManager({
  conversationId,
  storageContextKey,
}: { conversationId?: string | null; storageContextKey?: string } = {}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  /** Retained for `interface.mcpServers.placeholder` used by `placeholderText` below */
  const { data: startupConfig } = useGetStartupConfig();
  const canUseMcp = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });

  const { data: loadedServers, isLoading } = useMCPServersQuery({ enabled: canUseMcp });

  // Fetch effective permissions for all MCP servers
  const { data: permissionsMap } = useGetAllEffectivePermissionsQuery(ResourceType.MCPSERVER, {
    enabled: canUseMcp,
  });

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
    storageContextKey,
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
    onSuccess: async (_data, variables) => {
      const isRevoke = variables.action === 'uninstall';
      const message = isRevoke
        ? localize('com_nav_mcp_access_revoked')
        : localize('com_nav_mcp_vars_updated');
      showToast({ message, status: 'success' });

      /** Deselect server from mcpValues when revoking access */
      if (isRevoke && variables.pluginKey?.startsWith(Constants.mcp_prefix)) {
        const serverName = variables.pluginKey.replace(Constants.mcp_prefix, '');
        const currentValues = mcpValuesRef.current ?? [];
        const filteredValues = currentValues.filter((name) => name !== serverName);
        setMCPValues(filteredValues);
      }

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

  // Global atom for init states - shared across all useMCPServerManager instances
  // This enables canceling OAuth from both chat dropdown and settings panel
  const [serverInitStates, setServerInitStates] = useAtom(mcpServerInitStatesAtom);

  // Poll intervals are kept local (not serializable)
  const pollIntervalsRef = useRef<PollIntervals>({});

  const { connectionStatus } = useMCPConnectionStatus({
    enabled: !isLoading && availableMCPServers.length > 0,
  });

  const updateServerInitState = useCallback(
    (serverName: string, updates: Partial<MCPServerInitState>) => {
      setServerInitStates((prev) => {
        const currentState = getServerInitState(prev, serverName);
        return {
          ...prev,
          [serverName]: { ...currentState, ...updates },
        };
      });
    },
    [setServerInitStates],
  );

  const cleanupServerState = useCallback(
    (serverName: string) => {
      // Clear local poll interval
      const pollInterval = pollIntervalsRef.current[serverName];
      if (pollInterval) {
        clearTimeout(pollInterval);
        pollIntervalsRef.current[serverName] = null;
      }
      // Reset global init state
      updateServerInitState(serverName, {
        isInitializing: false,
        oauthUrl: null,
        oauthStartTime: null,
        isCancellable: false,
      });
    },
    [updateServerInitState],
  );

  const startServerPolling = useCallback(
    (serverName: string) => {
      // Prevent duplicate polling for the same server
      if (pollIntervalsRef.current[serverName]) {
        console.debug(`[MCP Manager] Polling already active for ${serverName}, skipping duplicate`);
        return;
      }

      let pollAttempts = 0;
      let timeoutId: NodeJS.Timeout | null = null;

      /** OAuth can take several minutes if the user steps away from the consent screen.
       * Poll for the full server-side handling window (MCP_OAUTH_HANDLING_TIMEOUT
       * default = 10 minutes) with gradual backoff, so the button stays usable as long
       * as the server will accept the callback.
       */
      const getPollInterval = (attempt: number): number => {
        if (attempt < 12) return 5000; // First minute: every 5s (12 polls)
        if (attempt < 22) return 6000; // Second minute: every 6s (10 polls)
        return 7500; // Thereafter: every 7.5s
      };

      /** Honor the server's configured MCP_OAUTH_HANDLING_TIMEOUT (surfaced on the
       * connection-status response) so a tuned deadline isn't capped at the default.
       * The cache may be empty at start, so this is refreshed from the first status
       * refetch below rather than captured once. */
      const connectionData = queryClient.getQueryData<MCPConnectionStatusResponse>([
        QueryKeys.mcpConnectionStatus,
      ]);
      let oauthTimeoutMs = connectionData?.oauthTimeout ?? 600000; // default 10 minutes
      // Backstop only; the elapsed-time guard governs. Sized above the worst-case poll count.
      let maxAttempts = Math.ceil(oauthTimeoutMs / 5000) + 5;

      const pollOnce = async () => {
        try {
          pollAttempts++;
          const state = getServerInitState(serverInitStates, serverName);

          /** Stop polling once the handling window or max attempts is exceeded */
          const elapsedTime = state?.oauthStartTime
            ? Date.now() - state.oauthStartTime
            : pollAttempts * 5000; // Rough estimate if no start time

          if (pollAttempts > maxAttempts || elapsedTime > oauthTimeoutMs) {
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

          const freshConnectionData = queryClient.getQueryData<MCPConnectionStatusResponse>([
            QueryKeys.mcpConnectionStatus,
          ]);
          // Pick up the configured timeout once the status response lands (cache may have
          // been empty when polling started), so a tuned deadline is honored mid-flight.
          if (typeof freshConnectionData?.oauthTimeout === 'number') {
            oauthTimeoutMs = freshConnectionData.oauthTimeout;
            maxAttempts = Math.ceil(oauthTimeoutMs / 5000) + 5;
          }
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
          if (state?.oauthStartTime && Date.now() - state.oauthStartTime > oauthTimeoutMs) {
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
          pollIntervalsRef.current[serverName] = timeoutId;
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
      pollIntervalsRef.current[serverName] = timeoutId;
    },
    [queryClient, serverInitStates, showToast, localize, setMCPValues, cleanupServerState],
  );

  const initializeServer = useCallback(
    async (serverName: string, autoOpenOAuth: boolean = true) => {
      /** connectionDeferred is reset up front so a stale value from a previous
       * attempt can never be mistaken for this attempt's outcome. */
      updateServerInitState(serverName, { isInitializing: true, connectionDeferred: false });
      try {
        const response = await reinitializeMutation.mutateAsync(serverName);
        /** Record whether this attempt deferred to a chat turn (request-scoped
         * server) so consumers that didn't await this call — e.g. the agent
         * builder behind the customUserVars config dialog — can react to it. */
        updateServerInitState(serverName, {
          connectionDeferred: Boolean(response.connectionDeferred),
        });
        if (!response.success) {
          showToast({
            message: localize('com_ui_mcp_init_failed', { 0: serverName }),
            status: 'error',
          });
          cleanupServerState(serverName);
          return response;
        }

        if (response.oauthRequired && response.oauthUrl) {
          updateServerInitState(serverName, {
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
      updateServerInitState,
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
      return getServerInitState(serverInitStates, serverName).isInitializing;
    },
    [serverInitStates],
  );

  const isCancellable = useCallback(
    (serverName: string) => {
      return getServerInitState(serverInitStates, serverName).isCancellable;
    },
    [serverInitStates],
  );

  const isConnectionDeferred = useCallback(
    (serverName: string) => {
      return getServerInitState(serverInitStates, serverName).connectionDeferred;
    },
    [serverInitStates],
  );

  /** Clear a recorded deferred outcome without starting a new attempt — used
   * before routing into the customUserVars config dialog so a stale flag from
   * an earlier attempt can't trigger consumers while the dialog is open. */
  const resetConnectionDeferred = useCallback(
    (serverName: string) => {
      updateServerInitState(serverName, { connectionDeferred: false });
    },
    [updateServerInitState],
  );

  const getOAuthUrl = useCallback(
    (serverName: string) => {
      return getServerInitState(serverInitStates, serverName).oauthUrl;
    },
    [serverInitStates],
  );

  const placeholderText = useMemo(
    () => startupConfig?.interface?.mcpServers?.placeholder || localize('com_ui_mcp_servers'),
    [startupConfig?.interface?.mcpServers?.placeholder, localize],
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
        setMCPValues([...currentValues, serverName]);
      }
    },
    [mcpValues, setMCPValues, isInitializing],
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
        /** Deselection is now handled centrally in updateUserPluginsMutation.onSuccess */
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation],
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
                  sensitive: config.sensitive,
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
      const hasPendingOAuth =
        serverStatus?.requiresOAuth === true && serverStatus.connectionState === 'connecting';
      const canCancelOAuth = isCancellable(serverName) || hasPendingOAuth;

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
        isInitializing: isInitializing(serverName) || hasPendingOAuth,
        canCancel: canCancelOAuth,
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
          sensitive: field.sensitive,
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
    isConnectionDeferred,
    resetConnectionDeferred,
    getOAuthUrl,
    mcpValues,
    setMCPValues,

    isPinned,
    setIsPinned,
    placeholderText,
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
