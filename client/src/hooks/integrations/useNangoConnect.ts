import { useCallback, useRef, useState } from 'react';
import Nango from '@nangohq/frontend';
import { useQueryClient } from '@tanstack/react-query';
import { useToastContext } from '@librechat/client';
import {
  isIntegrationConnected,
  needsIntegrationReconnect,
  QueryKeys,
} from 'librechat-data-provider';
import type { IntegrationConnectionStatus, IntegrationProviderKey } from 'librechat-data-provider';
import {
  useCreateIntegrationConnectSessionMutation,
  useDisconnectIntegrationMutation,
  useGetStartupConfig,
  useIntegrationStatusQuery,
  useSyncIntegrationConnectionMutation,
} from '~/data-provider';
import { isIntegrationReconnectSuccess } from '~/components/Integrations/connectPrompt';
import { INTEGRATION_LABEL_KEYS } from '~/constants/integrations';
import { useLocalize } from '~/hooks';

interface UseNangoConnectOptions {
  providerKey?: IntegrationProviderKey;
  enabled?: boolean;
}

export function useNangoConnect({
  providerKey = 'google-drive',
  enabled = true,
}: UseNangoConnectOptions = {}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const integrationsEnabled = startupConfig?.integrationsEnabled === true;
  const nangoHost = startupConfig?.nangoHost;
  const nangoConnectUrl = startupConfig?.nangoConnectUrl ?? nangoHost;

  const {
    data: statusData,
    isLoading,
    refetch,
  } = useIntegrationStatusQuery(providerKey, {
    enabled: enabled && integrationsEnabled,
  });

  const connectSessionMutation = useCreateIntegrationConnectSessionMutation();
  const syncMutation = useSyncIntegrationConnectionMutation();
  const disconnectMutation = useDisconnectIntegrationMutation();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const connectInFlightRef = useRef(false);

  const status: IntegrationConnectionStatus | undefined = statusData?.integration?.status;
  const isConnected = isIntegrationConnected(status ?? 'not_connected');
  const needsReconnect = needsIntegrationReconnect(status ?? 'not_connected');
  const labelKey =
    statusData?.integration?.labelKey ??
    INTEGRATION_LABEL_KEYS[providerKey] ??
    'com_integrations_google_drive';

  const syncStatus = useCallback(async () => {
    await queryClient.invalidateQueries([QueryKeys.integrations]);
    await queryClient.invalidateQueries([QueryKeys.integrationStatus, providerKey]);
    await refetch();
  }, [queryClient, providerKey, refetch]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!integrationsEnabled || !nangoHost || !nangoConnectUrl) {
      return false;
    }

    if (isConnected) {
      return true;
    }

    if (connectInFlightRef.current) {
      return false;
    }

    connectInFlightRef.current = true;
    setIsConnecting(true);
    const statusBeforeConnect = status;

    try {
      const session = await connectSessionMutation.mutateAsync(providerKey);
      const nango = new Nango({ host: nangoHost });
      const connectUiBaseUrl = session.connectUrl || nangoConnectUrl;

      const connected = await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(value);
        };

        let connectSucceeded = false;

        const connectUI = nango.openConnectUI({
          apiURL: nangoHost,
          baseURL: connectUiBaseUrl,
          detectClosedAuthWindow: true,
          onEvent: (event) => {
            if (event.type === 'connect') {
              connectSucceeded = true;
              void (async () => {
                try {
                  await syncMutation.mutateAsync(providerKey);
                  await syncStatus();
                  showToast({
                    message: localize(
                      isIntegrationReconnectSuccess(statusBeforeConnect)
                        ? 'com_integrations_reconnect_success'
                        : 'com_integrations_connect_success',
                    ),
                    status: 'success',
                  });
                  settle(true);
                } catch {
                  showToast({
                    message: localize('com_integrations_connect_error'),
                    status: 'error',
                  });
                  settle(false);
                }
              })();
              return;
            }

            if (event.type === 'close' && !connectSucceeded) {
              settle(false);
            }
          },
        });

        connectUI.setSessionToken(session.sessionToken);
      });

      if (!connected) {
        showToast({
          message: localize('com_integrations_connect_error'),
          status: 'warning',
        });
      }

      return connected;
    } catch {
      showToast({
        message: localize('com_integrations_connect_error'),
        status: 'error',
      });
      return false;
    } finally {
      connectInFlightRef.current = false;
      setIsConnecting(false);
    }
  }, [
    integrationsEnabled,
    nangoHost,
    nangoConnectUrl,
    isConnected,
    connectSessionMutation,
    syncMutation,
    providerKey,
    syncStatus,
    showToast,
    localize,
    status,
  ]);

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    if (!integrationsEnabled) {
      return false;
    }

    if (isConnected) {
      return true;
    }

    return connect();
  }, [integrationsEnabled, isConnected, connect]);

  const disconnect = useCallback(async (): Promise<boolean> => {
    if (!integrationsEnabled) {
      return false;
    }

    setIsDisconnecting(true);
    try {
      await disconnectMutation.mutateAsync(providerKey);
      await syncStatus();
      showToast({
        message: localize('com_integrations_disconnect_success'),
        status: 'success',
      });
      return true;
    } catch {
      showToast({
        message: localize('com_integrations_disconnect_error'),
        status: 'error',
      });
      return false;
    } finally {
      setIsDisconnecting(false);
    }
  }, [integrationsEnabled, disconnectMutation, providerKey, syncStatus, showToast, localize]);

  const canDisconnect = isConnected || needsReconnect;

  return {
    providerKey,
    labelKey,
    status,
    isConnected,
    needsReconnect,
    canDisconnect,
    isConnecting,
    isDisconnecting,
    isLoading,
    integrationsEnabled,
    connect,
    ensureConnected,
    disconnect,
    refetch: syncStatus,
  };
}
