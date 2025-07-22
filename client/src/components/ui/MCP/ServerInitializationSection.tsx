import { RefreshCw, Link } from 'lucide-react';
import React, { useState, useCallback } from 'react';
import { useMCPServerInitialization } from '~/hooks/MCP/useMCPServerInitialization';
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

  const [oauthUrl, setOauthUrl] = useState<string | null>(null);

  // Use the shared initialization hook
  const { initializeServer, isLoading, connectionStatus, cancelOAuthFlow, isCancellable } =
    useMCPServerInitialization({
      onOAuthStarted: (name, url) => {
        // Store the OAuth URL locally for display
        setOauthUrl(url);
      },
      onSuccess: () => {
        // Clear OAuth URL on success
        setOauthUrl(null);
      },
    });

  const serverStatus = connectionStatus[serverName];
  const isConnected = serverStatus?.connectionState === 'connected';
  const canCancel = isCancellable(serverName);

  const handleInitializeClick = useCallback(() => {
    setOauthUrl(null);
    initializeServer(serverName);
  }, [initializeServer, serverName]);

  const handleCancelClick = useCallback(() => {
    setOauthUrl(null);
    cancelOAuthFlow(serverName);
  }, [cancelOAuthFlow, serverName]);

  // Show subtle reinitialize option if connected
  if (isConnected) {
    return (
      <div className="flex justify-start">
        <button
          onClick={handleInitializeClick}
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
            onClick={handleInitializeClick}
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
              className="flex-1 bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-800"
            >
              {localize('com_ui_continue_oauth')}
            </Button>
            <Button
              onClick={handleCancelClick}
              disabled={!canCancel}
              className="bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              title={!canCancel ? 'disabled' : undefined}
            >
              {localize('com_ui_cancel')}
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
