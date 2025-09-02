import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { useLocalize, useMCPServerManager, useMCPConnectionStatus } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';

interface ServerInitializationSectionProps {
  sidePanel?: boolean;
  serverName: string;
  requiresOAuth: boolean;
  hasCustomUserVars?: boolean;
  conversationId?: string | null;
}

export default function ServerInitializationSection({
  serverName,
  requiresOAuth,
  conversationId,
  sidePanel = false,
  hasCustomUserVars = false,
}: ServerInitializationSectionProps) {
  const localize = useLocalize();

  const { initializeServer, cancelOAuthFlow, isInitializing, isCancellable, getOAuthUrl } =
    useMCPServerManager({ conversationId });

  const { data: startupConfig } = useGetStartupConfig();
  const { connectionStatus } = useMCPConnectionStatus({
    enabled: !!startupConfig?.mcpServers && Object.keys(startupConfig.mcpServers).length > 0,
  });

  const serverStatus = connectionStatus?.[serverName];
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

  let buttonText = '';
  if (isServerInitializing) {
    buttonText = localize('com_ui_loading');
  } else if (isReinit) {
    buttonText = localize('com_ui_reinitialize');
  } else if (requiresOAuth) {
    buttonText = localize('com_ui_authenticate');
  } else {
    buttonText = localize('com_ui_mcp_initialize');
  }

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
