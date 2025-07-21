import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import {
  useReinitializeMCPServerMutation,
  useMCPOAuthStatusQuery,
  useCompleteMCPServerReinitializeMutation,
} from 'librechat-data-provider/react-query';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';

import { RefreshCw, Link } from 'lucide-react';

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
  const [oauthFlowId, setOauthFlowId] = useState<string | null>(null);

  const { data: statusQuery } = useMCPConnectionStatusQuery();
  const mcpServerStatuses = statusQuery?.connectionStatus || {};
  const serverStatus = mcpServerStatuses[serverName];
  const isConnected = serverStatus?.connected || false;

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

  // OAuth completion mutation (stores our tools)
  const completeReinitializeMutation = useCompleteMCPServerReinitializeMutation();

  // Override the mutation success handlers
  const handleInitializeServer = useCallback(() => {
    // Reset OAuth state before starting
    setOauthUrl(null);
    setOauthFlowId(null);

    // Trigger initialization
    reinitializeMutation.mutate(serverName, {
      onSuccess: (response) => {
        if (response.oauthRequired) {
          if (response.authURL && response.flowId) {
            setOauthUrl(response.authURL);
            setOauthFlowId(response.flowId);
            // Keep loading state - OAuth completion will handle success
          } else {
            showToast({
              message: `OAuth authentication required for ${serverName}. Please configure OAuth credentials.`,
              status: 'warning',
            });
          }
        } else if (response.success) {
          handleSuccessfulConnection(
            response.message || `MCP server '${serverName}' initialized successfully`,
          );
        }
      },
      onError: (error: any) => {
        console.error('Error initializing MCP server:', error);
        showToast({
          message: 'Failed to initialize MCP server',
          status: 'error',
        });
      },
    });
  }, [reinitializeMutation, serverName, showToast, handleSuccessfulConnection]);

  // OAuth status polling (only when we have a flow ID)
  const oauthStatusQuery = useMCPOAuthStatusQuery(oauthFlowId || '', {
    enabled: !!oauthFlowId,
    refetchInterval: oauthFlowId ? 2000 : false,
    retry: false,
    onSuccess: (data) => {
      if (data?.completed) {
        // Immediately reset OAuth state to stop polling
        setOauthUrl(null);
        setOauthFlowId(null);

        // OAuth completed, trigger completion mutation
        completeReinitializeMutation.mutate(serverName, {
          onSuccess: (response) => {
            handleSuccessfulConnection(
              response.message || `MCP server '${serverName}' initialized successfully after OAuth`,
            );
          },
          onError: (error: any) => {
            // Check if it initialized anyway
            if (isConnected) {
              handleSuccessfulConnection('MCP server initialized successfully after OAuth');
              return;
            }

            console.error('Error completing MCP initialization:', error);
            showToast({
              message: 'Failed to complete MCP server initialization after OAuth',
              status: 'error',
            });

            // OAuth state already reset above
          },
        });
      } else if (data?.failed) {
        showToast({
          message: `OAuth authentication failed: ${data.error || 'Unknown error'}`,
          status: 'error',
        });
        // Reset OAuth state on failure
        setOauthUrl(null);
        setOauthFlowId(null);
      }
    },
  });

  // Reset OAuth state when component unmounts or server changes
  useEffect(() => {
    return () => {
      setOauthUrl(null);
      setOauthFlowId(null);
    };
  }, [serverName]);

  const isLoading =
    reinitializeMutation.isLoading ||
    completeReinitializeMutation.isLoading ||
    (!!oauthFlowId && oauthStatusQuery.isFetching);

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
          {isLoading ? localize('com_ui_loading') : 'Reinitialize'}
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
              ? `${serverName} not authenticated (OAuth Required)`
              : `${serverName} not initialized`}
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
              {localize('com_ui_authorization_url')}
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
