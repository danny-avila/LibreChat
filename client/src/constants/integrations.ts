import type { IntegrationProviderKey } from 'librechat-data-provider';

/** Fallback label keys when the integration status API omits labelKey. */
export const INTEGRATION_LABEL_KEYS: Partial<Record<IntegrationProviderKey, string>> = {
  'google-drive': 'com_integrations_google_drive',
  'google-mail': 'com_integrations_google_mail',
  'google-calendar': 'com_integrations_google_calendar',
};
