import type { IntegrationConnectionStatus } from 'librechat-data-provider';
import { needsIntegrationReconnect } from 'librechat-data-provider';

export interface ConnectPromptCopy {
  titleKey: string;
  descriptionKey: string;
  buttonKey: string;
}

export function getConnectPromptCopy(status?: IntegrationConnectionStatus): ConnectPromptCopy {
  if (status === 'expired') {
    return {
      titleKey: 'com_integrations_reconnect_expired_title',
      descriptionKey: 'com_integrations_reconnect_expired_description',
      buttonKey: 'com_integrations_reconnect_button',
    };
  }

  if (status === 'revoked') {
    return {
      titleKey: 'com_integrations_reconnect_revoked_title',
      descriptionKey: 'com_integrations_reconnect_revoked_description',
      buttonKey: 'com_integrations_reconnect_button',
    };
  }

  return {
    titleKey: 'com_integrations_connect_title',
    descriptionKey: 'com_integrations_connect_description',
    buttonKey: 'com_integrations_connect_button',
  };
}

export function isIntegrationReconnectSuccess(
  previousStatus: IntegrationConnectionStatus | undefined,
): boolean {
  return needsIntegrationReconnect(previousStatus ?? 'not_connected');
}
