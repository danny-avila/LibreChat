import { RefreshCw, Link } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState, useCallback, useEffect } from 'react';
import { useReinitializeMCPServerMutation } from 'librechat-data-provider/react-query';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';
import { useToastContext } from '~/Providers';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';

interface ServerInitializationSectionProps {
  serverName: string;
  requiresOAuth: boolean;
}

export default function ServerInitializationSection({
  serverName,
  requiresOAuth,
}: ServerInitializationSectionProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();

  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [isPollingOAuth, setIsPollingOAuth] = useState(false);

  const { data: statusQuery } = useMCPConnectionStatusQuery();
  const mcpServerStatuses = statusQuery?.connectionStatus || {};
  const serverStatus = mcpServerStatuses[serverName];
  const isConnected = serverStatus?.connectionState === 'connected';

  // Helper function to invalidate caches after successful connection
  const handleSuccessfulConnection = useCallback(
    async (message: string) => {
      showToast({ message, status: 'success' });

      // Force immediate refetch to update UI
      await Promise.all([
        queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]),
        queryClient.refetchQueries([QueryKeys.tools]),
      ]);
    },
    [showToast, queryClient],
  );

  // Main initialization mutation
  const reinitializeMutation = useReinitializeMCPServerMutation();

  // Simple initialization handler - mirrors callTool flow
  const handleInitializeServer = useCallback(() => {
    // Reset OAuth state before starting
    setOauthUrl(null);

    // Trigger initialization
    reinitializeMutation.mutate(serverName, {
      onSuccess: (response: any) => {
        if (response.success) {
          if (response.oauthRequired && response.oauthUrl) {
            // OAuth URL provided directly from backend
            setOauthUrl(response.oauthUrl);
            setIsPollingOAuth(true);
          } else if (response.oauthRequired) {
            // OAuth required but no URL yet - should not happen with new implementation
            showToast({
              message: localize('com_ui_mcp_oauth_no_url'),
              status: 'warning',
            });
          } else {
            // Successful connection without OAuth
            handleSuccessfulConnection(
              response.message || localize('com_ui_mcp_initialized_success', { 0: serverName }),
            );
          }
        }
      },
      onError: (error: any) => {
        console.error('Error initializing MCP server:', error);
        showToast({
          message: localize('com_ui_mcp_init_failed'),
          status: 'error',
        });
      },
    });
  }, [reinitializeMutation, serverName, showToast, localize, handleSuccessfulConnection]);

  // Poll for OAuth completion
  useEffect(() => {
    if (isPollingOAuth && isConnected) {
      // OAuth completed successfully
      setIsPollingOAuth(false);
      setOauthUrl(null);
      handleSuccessfulConnection(localize('com_ui_mcp_authenticated_success', { 0: serverName }));
    }
  }, [isPollingOAuth, isConnected, serverName, handleSuccessfulConnection, localize]);

  // Set up polling when OAuth URL is present
  useEffect(() => {
    if (!oauthUrl || !isPollingOAuth) {
      return;
    }

    const pollInterval = setInterval(() => {
      // Refetch connection status to check if OAuth completed
      queryClient.refetchQueries([QueryKeys.mcpConnectionStatus]);
    }, 2000); // Poll every 2 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, [oauthUrl, isPollingOAuth, queryClient]);

  const isLoading = reinitializeMutation.isLoading;

  // Show subtle reinitialize option if connected
  if (isConnected) {
    return (
      <div className="flex justify-start">
        <button
          onClick={handleInitializeServer}
          disabled={isLoading}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-400"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? localize('com_ui_loading') : localize('com_ui_reinitialize')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#991b1b] bg-[#2C1315] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            {requiresOAuth
              ? localize('com_ui_mcp_not_authenticated', { 0: serverName })
              : localize('com_ui_mcp_not_initialized', { 0: serverName })}
          </span>
        </div>
        {/* Only show authenticate button when OAuth URL is not present */}
        {!oauthUrl && (
          <Button
            onClick={handleInitializeServer}
            disabled={isLoading}
            className="flex items-center gap-2 bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 dark:hover:bg-blue-800"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {localize('com_ui_loading')}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {requiresOAuth
                  ? localize('com_ui_authenticate')
                  : localize('com_ui_mcp_initialize')}
              </>
            )}
          </Button>
        )}
      </div>

      {/* OAuth URL display */}
      {oauthUrl && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/20">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
              <Link className="h-2.5 w-2.5 text-white" />
            </div>
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {localize('com_ui_auth_url')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => window.open(oauthUrl, '_blank', 'noopener,noreferrer')}
              className="w-full bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-800"
            >
              {localize('com_ui_continue_oauth')}
            </Button>
          </div>
          <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
            {localize('com_ui_oauth_flow_desc')}
          </p>
        </div>
      )}
    </div>
  );
}
