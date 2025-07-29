import React, { useCallback } from 'react';
import { Button } from '@librechat/client';
import { RefreshCw, Link } from 'lucide-react';
import { useMCPServerManager } from '~/hooks/MCP/useMCPServerManager';
import { useLocalize } from '~/hooks';

interface ServerInitializationSectionProps {
  serverName: string;
  requiresOAuth: boolean;
  hasCustomUserVars?: boolean;
}

export default function ServerInitializationSection({
  serverName,
  requiresOAuth,
  hasCustomUserVars = false,
}: ServerInitializationSectionProps) {
  const localize = useLocalize();

  // Use the centralized server manager instead of the old initialization hook so we can handle multiple oauth flows at once
  const {
    initializeServer,
    connectionStatus,
    cancelOAuthFlow,
    isInitializing,
    isCancellable,
    getOAuthUrl,
  } = useMCPServerManager();

  const serverStatus = connectionStatus[serverName];
  const isConnected = serverStatus?.connectionState === 'connected';
  const canCancel = isCancellable(serverName);
  const isServerInitializing = isInitializing(serverName);
  const serverOAuthUrl = getOAuthUrl(serverName);

  const handleInitializeClick = useCallback(() => {
    initializeServer(serverName, false);
  }, [initializeServer, serverName]);

  const handleCancelClick = useCallback(() => {
    cancelOAuthFlow(serverName);
  }, [cancelOAuthFlow, serverName]);

  if (isConnected && (requiresOAuth || hasCustomUserVars)) {
    return (
      <div className="flex justify-start">
        <button
          onClick={handleInitializeClick}
          disabled={isServerInitializing}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-400"
        >
          <RefreshCw className={`h-3 w-3 ${isServerInitializing ? 'animate-spin' : ''}`} />
          {isServerInitializing ? localize('com_ui_loading') : localize('com_ui_reinitialize')}
        </button>
      </div>
    );
  }

  if (isConnected) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {requiresOAuth
              ? localize('com_ui_mcp_not_authenticated', { 0: serverName })
              : localize('com_ui_mcp_not_initialized', { 0: serverName })}
          </span>
        </div>
        {/* Only show authenticate button when OAuth URL is not present */}
        {!serverOAuthUrl && (
          <Button
            onClick={handleInitializeClick}
            disabled={isServerInitializing}
            className="btn btn-primary focus:shadow-outline flex w-full items-center justify-center px-4 py-2 font-semibold text-white hover:bg-green-600 focus:border-green-500"
          >
            {isServerInitializing ? (
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
      {serverOAuthUrl && (
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
              onClick={() => window.open(serverOAuthUrl, '_blank', 'noopener,noreferrer')}
              className="flex-1 bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-800"
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
