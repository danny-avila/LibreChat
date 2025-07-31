import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { useMCPServerManager } from '~/hooks/MCP/useMCPServerManager';
import { useLocalize } from '~/hooks';

interface ServerInitializationSectionProps {
  sidePanel?: boolean;
  serverName: string;
  requiresOAuth: boolean;
  hasCustomUserVars?: boolean;
}

export default function ServerInitializationSection({
  sidePanel = false,
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
      <>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => cancelOAuthFlow(serverName)}
            disabled={!canCancel}
            variant="outline"
            title={!canCancel ? 'disabled' : undefined}
          >
            {localize('com_ui_cancel')}
          </Button>
          <Button
            variant="submit"
            onClick={() => window.open(serverOAuthUrl, '_blank', 'noopener,noreferrer')}
            className="flex-1"
          >
            {localize('com_ui_continue_oauth')}
          </Button>
        </div>
      </>
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
        size={sidePanel ? 'sm' : 'default'}
        className="w-full"
      >
        {icon}
        {buttonText}
      </Button>
    </div>
  );
}
