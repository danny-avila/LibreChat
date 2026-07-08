import { useState } from 'react';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import { isIntegrationConnected, needsIntegrationReconnect } from 'librechat-data-provider';
import type { IntegrationProviderKey } from 'librechat-data-provider';
import { useGetStartupConfig, useIntegrationsQuery } from '~/data-provider';
import { useIntegrationConnectors, useLocalize } from '~/hooks';
import { INTEGRATION_LABEL_KEYS } from '~/constants/integrations';
import { IntegrationProviderIcon } from './IntegrationProviderIcon';
import { IntegrationStatusChip } from './IntegrationStatusChip';

const HUB_PROVIDER_ORDER: IntegrationProviderKey[] = [
  'google-drive',
  'google-mail',
  'google-calendar',
  'microsoft',
  'dropbox',
  'box',
  'clio',
  'quickbooks',
];

export default function IntegrationsPanel() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const integrationsEnabled = startupConfig?.integrationsEnabled === true;
  const { data: integrationsList, isLoading } = useIntegrationsQuery({
    enabled: integrationsEnabled,
  });
  const connectors = useIntegrationConnectors(integrationsEnabled);
  const [confirmDisconnect, setConfirmDisconnect] = useState<IntegrationProviderKey | null>(null);

  const disconnectConnector = confirmDisconnect ? connectors[confirmDisconnect] : undefined;

  const handleConnect = (providerKey: IntegrationProviderKey) => {
    void connectors[providerKey]?.connect();
  };

  const handleDisconnect = async () => {
    if (!disconnectConnector) {
      return;
    }
    const disconnected = await disconnectConnector.disconnect();
    if (disconnected) {
      setConfirmDisconnect(null);
    }
  };

  if (!integrationsEnabled) {
    return (
      <div className="px-3 py-4 text-sm text-text-secondary">
        {localize('com_integrations_hub_disabled')}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  const integrations = integrationsList?.integrations ?? [];
  const enabledByKey = new Map(
    integrations
      .filter((integration) => integration.enabled)
      .map((integration) => [integration.providerKey, integration]),
  );

  const orderedProviders = HUB_PROVIDER_ORDER.filter((providerKey) =>
    enabledByKey.has(providerKey),
  );

  const disconnectLabel = disconnectConnector
    ? localize(disconnectConnector.labelKey as Parameters<typeof localize>[0])
    : '';

  return (
    <div className="flex flex-col gap-3 px-3 pb-3 pt-2">
      <p className="text-sm text-text-secondary">{localize('com_integrations_hub_description')}</p>
      <ul className="flex flex-col gap-2">
        {orderedProviders.map((providerKey) => {
          const integration = enabledByKey.get(providerKey);
          if (!integration) {
            return null;
          }

          const connector = connectors[providerKey];
          const labelKey =
            integration.labelKey ??
            INTEGRATION_LABEL_KEYS[providerKey] ??
            'com_integrations_google_drive';
          const providerLabel = localize(labelKey as Parameters<typeof localize>[0]);
          const connected = isIntegrationConnected(integration.status);
          const reconnect = needsIntegrationReconnect(integration.status);
          const connectLabel = reconnect
            ? localize('com_integrations_reconnect_button')
            : localize('com_integrations_connect_button');

          return (
            <li
              key={providerKey}
              className="flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <IntegrationProviderIcon providerKey={providerKey} className="size-5" />
                <span className="truncate text-sm font-medium">{providerLabel}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <IntegrationStatusChip status={integration.status} />
                {connected && !reconnect ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDisconnect(providerKey)}
                    disabled={connector?.isDisconnecting}
                  >
                    {localize('com_integrations_disconnect_button')}
                  </Button>
                ) : (
                  <Button
                    variant="submit"
                    size="sm"
                    onClick={() => handleConnect(providerKey)}
                    disabled={connector?.isConnecting}
                  >
                    {connector?.isConnecting ? (
                      <>
                        <Spinner className="mr-2 h-4 w-4" />
                        {localize('com_ui_loading')}
                      </>
                    ) : (
                      connectLabel
                    )}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <OGDialog
        open={confirmDisconnect != null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDisconnect(null);
          }
        }}
      >
        <OGDialogContent className="max-w-md">
          <OGDialogTitle>
            {localize('com_integrations_disconnect_provider', { provider: disconnectLabel })}
          </OGDialogTitle>
          <OGDialogDescription>
            {localize('com_integrations_disconnect_confirm', { provider: disconnectLabel })}
          </OGDialogDescription>
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDisconnect(null)}
              disabled={disconnectConnector?.isDisconnecting}
            >
              {localize('com_ui_cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnectConnector?.isDisconnecting}
            >
              {disconnectConnector?.isDisconnecting ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {localize('com_ui_loading')}
                </>
              ) : (
                localize('com_integrations_disconnect_button')
              )}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
