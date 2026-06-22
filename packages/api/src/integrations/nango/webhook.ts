import type { IntegrationProviderKey } from '../providers';
import { listEnabledIntegrationProviders } from '../providers';

export interface NangoAuthWebhookPayload {
  type: string;
  operation?: string;
  success?: boolean;
  connectionId?: string;
  providerConfigKey?: string;
  tags?: {
    end_user_id?: string;
    end_user_email?: string;
    organization_id?: string;
  };
}

export function parseNangoAuthWebhookPayload(body: unknown): NangoAuthWebhookPayload | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  return body as NangoAuthWebhookPayload;
}

export function resolveProviderKeyFromWebhook(
  integrationId: string | undefined,
): IntegrationProviderKey | undefined {
  if (!integrationId) {
    return undefined;
  }
  return listEnabledIntegrationProviders().find(
    (provider) => provider.nangoIntegrationId === integrationId,
  )?.key;
}
