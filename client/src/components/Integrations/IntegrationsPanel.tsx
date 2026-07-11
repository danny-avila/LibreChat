import { useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Paperclip } from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialog,
  DropdownPopup,
  OGDialogTitle,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import {
  Constants,
  mergeFileConfig,
  resolveEndpointType,
  getEndpointFileConfig,
  isIntegrationConnected,
  needsIntegrationReconnect,
} from 'librechat-data-provider';
import type { IntegrationProviderKey } from 'librechat-data-provider';
import {
  useGetFileConfig,
  useGetStartupConfig,
  useIntegrationsQuery,
  useGetEndpointsQuery,
} from '~/data-provider';
import {
  useLocalize,
  useUploadTypeItems,
  useIntegrationPickers,
  useIntegrationConnectors,
} from '~/hooks';
import { useChatContext } from '~/Providers';
import { INTEGRATION_LABEL_KEYS } from '~/constants/integrations';
import { cn } from '~/utils';
import { IntegrationProviderIcon } from './IntegrationProviderIcon';
import { IntegrationPickerDialogs } from './IntegrationPickerDialogs';
import { getRowAttachMenu } from './buildAttachIntegrationMenuItems';

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
  const [openMenuProvider, setOpenMenuProvider] = useState<IntegrationProviderKey | null>(null);

  const { files, setFiles, setFilesLoading, conversation } = useChatContext();
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const endpoint = conversation?.endpoint ?? null;
  const agentId = conversation?.agent_id;
  const useResponsesApi = conversation?.useResponsesApi;

  const { data: endpointsConfig } = useGetEndpointsQuery();
  const endpointType = useMemo(
    () => resolveEndpointType(endpointsConfig, endpoint),
    [endpointsConfig, endpoint],
  );
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data as Parameters<typeof mergeFileConfig>[0]),
  });
  const endpointFileConfig = useMemo(
    () => getEndpointFileConfig({ fileConfig, endpointType, endpoint }),
    [fileConfig, endpointType, endpoint],
  );

  const { openers, setToolResource, dialogProps } = useIntegrationPickers(
    { files, setFiles, setFilesLoading, conversation },
    { endpointFileConfig, integrationsEnabled },
  );

  const createMenuItems = useUploadTypeItems({
    agentId,
    endpoint,
    endpointType,
    useResponsesApi,
    conversationId,
    setToolResource,
  });

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
    <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
      <p className="text-sm text-text-secondary">{localize('com_integrations_hub_description')}</p>
      <ul className="divide-y divide-border-light">
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
          const disconnectAriaLabel = localize('com_integrations_disconnect_provider', {
            provider: providerLabel,
          });
          const connected = isIntegrationConnected(integration.status);
          const reconnect = needsIntegrationReconnect(integration.status);
          const isLinked = connected && !reconnect;
          const actionLabel = isLinked
            ? localize('com_integrations_status_connected')
            : reconnect
              ? localize('com_integrations_reconnect_button')
              : localize('com_integrations_connect_button');
          const actionAriaLabel = isLinked
            ? disconnectAriaLabel
            : reconnect
              ? localize('com_integrations_reconnect_expired_title', { provider: providerLabel })
              : localize('com_integrations_connect_title', { provider: providerLabel });
          const isActionLoading = isLinked ? connector?.isDisconnecting : connector?.isConnecting;

          const handleAction = () => {
            if (isLinked) {
              setConfirmDisconnect(providerKey);
              return;
            }
            handleConnect(providerKey);
          };

          const rowAttachMenu = isLinked
            ? getRowAttachMenu(providerKey, {
                createFileTypeSubItems: createMenuItems,
                localize,
                openers,
              })
            : null;
          const attachAriaLabel = localize('com_integrations_attach_files', {
            provider: providerLabel,
          });

          return (
            <li key={providerKey} className="flex items-center justify-between gap-2 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <IntegrationProviderIcon providerKey={providerKey} className="size-4 shrink-0" />
                <p className="truncate text-sm font-medium text-text-primary">{providerLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {rowAttachMenu?.kind === 'direct' && (
                  <button
                    type="button"
                    aria-label={attachAriaLabel}
                    className="flex size-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={rowAttachMenu.open}
                  >
                    <Paperclip className="size-4" />
                  </button>
                )}
                {rowAttachMenu?.kind === 'menu' && (
                  <DropdownPopup
                    menuId={`integration-attach-${providerKey}`}
                    isOpen={openMenuProvider === providerKey}
                    setIsOpen={(open) => setOpenMenuProvider(open ? providerKey : null)}
                    unmountOnHide={true}
                    iconClassName="mr-0"
                    items={rowAttachMenu.items}
                    trigger={
                      <Ariakit.MenuButton
                        aria-label={attachAriaLabel}
                        className="flex size-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Paperclip className="size-4" />
                      </Ariakit.MenuButton>
                    }
                  />
                )}
                <Button
                  variant="link"
                  size="sm"
                  className={cn(
                    'h-6 shrink-0 px-1.5 text-xs font-normal no-underline hover:no-underline',
                    isLinked
                      ? 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
                      : reconnect
                        ? 'text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300'
                        : 'text-text-secondary hover:text-text-primary',
                  )}
                  aria-label={actionAriaLabel}
                  aria-pressed={isLinked}
                  onClick={handleAction}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? <Spinner className="h-3.5 w-3.5" /> : actionLabel}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <IntegrationPickerDialogs {...dialogProps} />

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
