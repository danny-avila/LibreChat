import { useCallback, useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import {
  useReinitializeMCPServerMutation,
  useCancelMCPOAuthMutation,
} from 'librechat-data-provider/react-query';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

interface UseMCPServerInitializationOptions {
  onSuccess?: (serverName: string) => void;
  onOAuthStarted?: (serverName: string, oauthUrl: string) => void;
  onError?: (serverName: string, error: any) => void;
}

export function useMCPServerInitialization(options?: UseMCPServerInitializationOptions) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();

  // OAuth state management
  const [oauthPollingServers, setOauthPollingServers] = useState<Map<string, string>>(new Map());
  const [oauthStartTimes, setOauthStartTimes] = useState<Map<string, number>>(new Map());
  const [initializingServers, setInitializingServers] = useState<Set<string>>(new Set());
  const [cancellableServers, setCancellableServers] = useState<Set<string>>(new Set());

  // Get connection status
  const { data: connectionStatusData } = useMCPConnectionStatusQuery();
  const connectionStatus = useMemo(
    () => connectionStatusData?.connectionStatus || {},
    [connectionStatusData],
  );

  // Main initialization mutation
  const reinitializeMutation = useReinitializeMCPServerMutation();

  // Cancel OAuth mutation
  const cancelOAuthMutation = useCancelMCPOAuthMutation();

  // Helper function to clean up OAuth state
  const cleanupOAuthState = useCallback((serverName: string) => {
    setOauthPollingServers((prev) => {
      const newMap = new Map(prev);
      newMap.delete(serverName);
      return newMap;
    });

    setOauthStartTimes((prev) => {
      const newMap = new Map(prev);
      newMap.delete(serverName);
      return newMap;
    });

    setInitializingServers((prev) => {
      const newSet = new Set(prev);
      newSet.delete(serverName);
      return newSet;
    });

    setCancellableServers((prev) => {
      const newSet = new Set(prev);
      newSet.delete(serverName);
      return newSet;
    });
  }, []);

  // Cancel OAuth flow
  const cancelOAuthFlow = useCallback(
    (serverName: string) => {
      logger.info(`[MCP OAuth] User cancelling OAuth flow for ${serverName}`);

      cancelOAuthMutation.mutate(serverName, {
        onSuccess: () => {
          cleanupOAuthState(serverName);
          showToast({
            message: localize('com_ui_mcp_oauth_cancelled', { 0: serverName }),
            status: 'info',
          });
        },
        onError: (error) => {
          logger.error(`[MCP OAuth] Failed to cancel OAuth flow for ${serverName}:`, error);
          // Clean up state anyway
          cleanupOAuthState(serverName);
        },
      });
    },
    [cancelOAuthMutation, cleanupOAuthState, showToast, localize],
  );

  // Helper function to handle successful connection
  const handleSuccessfulConnection = useCallback(
    async (serverName: string, message: string) => {
      showToast({ message, status: 'success' });

      // Force immediate refetch to update UI
      await Promise.all([
        queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]),
        queryClient.refetchQueries([QueryKeys.tools]),
      ]);

      // Clean up OAuth state
      cleanupOAuthState(serverName);

      // Call optional success callback
      options?.onSuccess?.(serverName);
    },
    [showToast, queryClient, options, cleanupOAuthState],
  );

  // Helper function to handle OAuth timeout/failure
  const handleOAuthFailure = useCallback(
    (serverName: string, isTimeout: boolean) => {
      logger.warn(
        `[MCP OAuth] OAuth ${isTimeout ? 'timed out' : 'failed'} for ${serverName}, stopping poll`,
      );

      // Clean up OAuth state
      cleanupOAuthState(serverName);

      // Show error toast
      showToast({
        message: isTimeout
          ? localize('com_ui_mcp_oauth_timeout', { 0: serverName })
          : localize('com_ui_mcp_init_failed'),
        status: 'error',
      });
    },
    [showToast, localize, cleanupOAuthState],
  );

  // Poll for OAuth completion
  useEffect(() => {
    if (oauthPollingServers.size === 0) {
      return;
    }

    const pollInterval = setInterval(() => {
      // Check each polling server
      oauthPollingServers.forEach((oauthUrl, serverName) => {
        const serverStatus = connectionStatus[serverName];

        // Check for client-side timeout (3 minutes)
        const startTime = oauthStartTimes.get(serverName);
        const hasTimedOut = startTime && Date.now() - startTime > 180000; // 3 minutes

        if (serverStatus?.connectionState === 'connected') {
          // OAuth completed successfully
          handleSuccessfulConnection(
            serverName,
            localize('com_ui_mcp_authenticated_success', { 0: serverName }),
          );
        } else if (serverStatus?.connectionState === 'error' || hasTimedOut) {
          // OAuth failed or timed out
          handleOAuthFailure(serverName, !!hasTimedOut);
        }

        setCancellableServers((prev) => new Set(prev).add(serverName));
      });

      queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]);
    }, 3500);

    return () => {
      clearInterval(pollInterval);
    };
  }, [
    oauthPollingServers,
    oauthStartTimes,
    connectionStatus,
    queryClient,
    handleSuccessfulConnection,
    handleOAuthFailure,
    localize,
  ]);

  // Initialize server function
  const initializeServer = useCallback(
    (serverName: string) => {
      // Prevent spam - check if already initializing
      if (initializingServers.has(serverName)) {
        return;
      }

      // Add to initializing set
      setInitializingServers((prev) => new Set(prev).add(serverName));

      // Trigger initialization
      reinitializeMutation.mutate(serverName, {
        onSuccess: (response: any) => {
          if (response.success) {
            if (response.oauthRequired && response.oauthUrl) {
              // OAuth required - store URL and start polling
              setOauthPollingServers((prev) => new Map(prev).set(serverName, response.oauthUrl));

              // Track when OAuth started for timeout detection
              setOauthStartTimes((prev) => new Map(prev).set(serverName, Date.now()));

              // Call optional OAuth callback or open URL directly
              if (options?.onOAuthStarted) {
                options.onOAuthStarted(serverName, response.oauthUrl);
              } else {
                window.open(response.oauthUrl, '_blank', 'noopener,noreferrer');
              }

              showToast({
                message: localize('com_ui_connecting'),
                status: 'info',
              });
            } else if (response.oauthRequired) {
              // OAuth required but no URL - shouldn't happen
              showToast({
                message: localize('com_ui_mcp_oauth_no_url'),
                status: 'warning',
              });
              // Remove from initializing since it failed
              setInitializingServers((prev) => {
                const newSet = new Set(prev);
                newSet.delete(serverName);
                return newSet;
              });
            } else {
              // Successful connection without OAuth
              handleSuccessfulConnection(
                serverName,
                response.message || localize('com_ui_mcp_initialized_success', { 0: serverName }),
              );
            }
          } else {
            // Remove from initializing if not successful
            setInitializingServers((prev) => {
              const newSet = new Set(prev);
              newSet.delete(serverName);
              return newSet;
            });
          }
        },
        onError: (error: any) => {
          console.error('Error initializing MCP server:', error);
          showToast({
            message: localize('com_ui_mcp_init_failed'),
            status: 'error',
          });
          // Remove from initializing on error
          setInitializingServers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(serverName);
            return newSet;
          });
          // Remove from OAuth tracking
          setOauthPollingServers((prev) => {
            const newMap = new Map(prev);
            newMap.delete(serverName);
            return newMap;
          });
          setOauthStartTimes((prev) => {
            const newMap = new Map(prev);
            newMap.delete(serverName);
            return newMap;
          });
          // Call optional error callback
          options?.onError?.(serverName, error);
        },
      });
    },
    [
      reinitializeMutation,
      showToast,
      localize,
      handleSuccessfulConnection,
      initializingServers,
      options,
    ],
  );

  return {
    initializeServer,
    isInitializing: (serverName: string) => initializingServers.has(serverName),
    isCancellable: (serverName: string) => cancellableServers.has(serverName),
    initializingServers,
    oauthPollingServers,
    oauthStartTimes,
    connectionStatus,
    isLoading: reinitializeMutation.isLoading,
    cancelOAuthFlow,
  };
}
