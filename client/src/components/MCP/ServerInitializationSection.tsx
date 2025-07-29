import React from 'react';
import { RefreshCw, Link } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
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

  const shouldShowReinit = isConnected && (requiresOAuth || hasCustomUserVars);
  const shouldShowInit = !isConnected && !serverOAuthUrl;

  if (!shouldShowReinit && !shouldShowInit && !serverOAuthUrl) {
    return null;
  }

  if (serverOAuthUrl) {
    return (
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
            onClick={() => cancelOAuthFlow(serverName)}
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
    );
  }

  // Unified button rendering
  const isReinit = shouldShowReinit;
  const outerClass = isReinit ? 'flex justify-start' : 'flex justify-end';
  const buttonVariant = isReinit ? undefined : 'default';
  const buttonText = isServerInitializing
    ? localize('com_ui_loading')
    : isReinit
      ? localize('com_ui_reinitialize')
      : requiresOAuth
        ? localize('com_ui_authenticate')
        : localize('com_ui_mcp_initialize');
  const icon = isServerInitializing ? (
    <Spinner className="h-4 w-4" />
  ) : (
    <RefreshCw className="h-4 w-4" />
  );

  return (
    <div className={outerClass}>
      <Button
        variant={buttonVariant}
        onClick={() => initializeServer(serverName, false)}
        disabled={isServerInitializing}
        className="w-full"
      >
        {icon}
        {buttonText}
      </Button>
    </div>
  );
}
