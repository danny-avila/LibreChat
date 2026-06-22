export const IntegrationProviderKey = {
  GOOGLE_DRIVE: 'google-drive',
  GOOGLE_MAIL: 'google-mail',
  GOOGLE_CALENDAR: 'google-calendar',
  MICROSOFT: 'microsoft',
  DROPBOX: 'dropbox',
  BOX: 'box',
  CLIO: 'clio',
} as const;

export type IntegrationProviderKey =
  (typeof IntegrationProviderKey)[keyof typeof IntegrationProviderKey];

export type IntegrationConnectionStatus =
  | 'connected'
  | 'not_connected'
  | 'expired'
  | 'revoked'
  | 'disabled';

export interface IntegrationProviderConfig {
  key: IntegrationProviderKey;
  nangoIntegrationId: string;
  labelKey: string;
  icon: string;
  enabled: boolean;
}

export interface IntegrationProviderStatus {
  providerKey: IntegrationProviderKey;
  nangoIntegrationId: string;
  labelKey: string;
  icon: string;
  enabled: boolean;
  status: IntegrationConnectionStatus;
  connectionId?: string;
  connectedAt?: string;
  updatedAt?: string;
}

export const INTEGRATION_PROVIDERS: Record<IntegrationProviderKey, IntegrationProviderConfig> = {
  [IntegrationProviderKey.GOOGLE_DRIVE]: {
    key: IntegrationProviderKey.GOOGLE_DRIVE,
    nangoIntegrationId: 'google-drive',
    labelKey: 'com_integrations_google_drive',
    icon: 'drive',
    enabled: true,
  },
  [IntegrationProviderKey.GOOGLE_MAIL]: {
    key: IntegrationProviderKey.GOOGLE_MAIL,
    nangoIntegrationId: 'google-mail',
    labelKey: 'com_integrations_google_mail',
    icon: 'mail',
    enabled: true,
  },
  [IntegrationProviderKey.GOOGLE_CALENDAR]: {
    key: IntegrationProviderKey.GOOGLE_CALENDAR,
    nangoIntegrationId: 'google-calendar',
    labelKey: 'com_integrations_google_calendar',
    icon: 'calendar',
    enabled: true,
  },
  [IntegrationProviderKey.MICROSOFT]: {
    key: IntegrationProviderKey.MICROSOFT,
    nangoIntegrationId: 'microsoft',
    labelKey: 'com_integrations_microsoft',
    icon: 'microsoft',
    enabled: false,
  },
  [IntegrationProviderKey.DROPBOX]: {
    key: IntegrationProviderKey.DROPBOX,
    nangoIntegrationId: 'dropbox',
    labelKey: 'com_integrations_dropbox',
    icon: 'dropbox',
    enabled: false,
  },
  [IntegrationProviderKey.BOX]: {
    key: IntegrationProviderKey.BOX,
    nangoIntegrationId: 'box',
    labelKey: 'com_integrations_box',
    icon: 'box',
    enabled: false,
  },
  [IntegrationProviderKey.CLIO]: {
    key: IntegrationProviderKey.CLIO,
    nangoIntegrationId: 'clio',
    labelKey: 'com_integrations_clio',
    icon: 'clio',
    enabled: false,
  },
};

const providerKeySet = new Set<string>(Object.values(IntegrationProviderKey));

export function isIntegrationProviderKey(value: string): value is IntegrationProviderKey {
  return providerKeySet.has(value);
}

export function getIntegrationProvider(providerKey: string): IntegrationProviderConfig | undefined {
  if (!isIntegrationProviderKey(providerKey)) {
    return undefined;
  }
  return INTEGRATION_PROVIDERS[providerKey];
}

export function listEnabledIntegrationProviders(): IntegrationProviderConfig[] {
  return Object.values(INTEGRATION_PROVIDERS).filter((provider) => provider.enabled);
}

export function listAllIntegrationProviders(): IntegrationProviderConfig[] {
  return Object.values(INTEGRATION_PROVIDERS);
}
