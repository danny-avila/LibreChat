import type { AppConfig } from '@librechat/data-schemas';
import {
  hasLangfuseEnvCredentials,
  isLangfuseFanoutEnabled,
  isLangfuseTenantExportEnabled,
  isLangfuseTracingEnabled,
  isLangfuseTraceSampled,
  usesLangfuseMultiTenantRouting,
} from './policy';
import { normalizeBoolean, resolveTenantCredentials, toBasicAuthorization } from './utils';
import { resolveLangfuseTenantDestination } from './tenantDestinations';
import { normalizeString } from '~/utils/text';

const DEFAULT_BASE_URL = 'https://cloud.langfuse.com';

export type LangfuseScoreDestination = {
  name: 'central' | 'tenant' | 'connection';
  baseUrl: string;
  authorization: string;
};

function getCentralEnvBaseUrl(): string {
  return (
    normalizeString(process.env.LANGFUSE_BASE_URL) ??
    normalizeString(process.env.LANGFUSE_HOST) ??
    normalizeString(process.env.LANGFUSE_BASEURL) ??
    DEFAULT_BASE_URL
  );
}

function getCentralScoreDestination(): LangfuseScoreDestination | undefined {
  // Central feedback scores are sent directly by the app, not through the
  // collector, so they use LibreChat's normal central Langfuse credentials.
  // LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER is intentionally collector-only.
  const publicKey = normalizeString(process.env.LANGFUSE_PUBLIC_KEY);
  const secretKey = normalizeString(process.env.LANGFUSE_SECRET_KEY);
  if (!publicKey || !secretKey) {
    return undefined;
  }

  return {
    name: 'central',
    baseUrl: getCentralEnvBaseUrl(),
    authorization: toBasicAuthorization(publicKey, secretKey),
  };
}

function getTenantScoreDestination(appConfig?: AppConfig): LangfuseScoreDestination | undefined {
  if (!isLangfuseTenantExportEnabled()) {
    return undefined;
  }

  const config = appConfig?.langfuse;
  if (normalizeBoolean(config?.enabled) !== true) {
    return undefined;
  }
  if (!isLangfuseFanoutEnabled()) {
    return undefined;
  }
  const fanoutCollectorUrl = normalizeString(process.env.LANGFUSE_FANOUT_COLLECTOR_URL);
  if (!fanoutCollectorUrl) {
    return undefined;
  }

  const tenantCredentials = resolveTenantCredentials(config);
  if (!tenantCredentials) {
    return undefined;
  }
  const destination = resolveLangfuseTenantDestination(config?.destination);
  if (!destination) {
    return undefined;
  }

  return {
    name: 'tenant',
    baseUrl: destination.baseUrl,
    authorization: toBasicAuthorization(tenantCredentials.publicKey, tenantCredentials.secretKey),
  };
}

function getConfiguredScoreDestination(
  appConfig?: AppConfig,
): LangfuseScoreDestination | undefined {
  const config = appConfig?.langfuse;
  if (normalizeBoolean(config?.enabled) !== true) {
    return undefined;
  }

  const credentials = resolveTenantCredentials(config);
  const destination = resolveLangfuseTenantDestination(config?.destination);
  if (!credentials || !destination) {
    return undefined;
  }

  return {
    name: 'connection',
    baseUrl: destination.baseUrl,
    authorization: toBasicAuthorization(credentials.publicKey, credentials.secretKey),
  };
}

/**
 * Scores use Langfuse's direct REST API. Multi-tenant score fanout follows the
 * collector availability gate used by traces; single-tenant connections send
 * directly to their configured destination.
 */
export function getScoreDestinations(
  appConfig: AppConfig | undefined,
  traceId: string,
  sampled?: boolean,
): LangfuseScoreDestination[] {
  if (
    !isLangfuseTracingEnabled() ||
    sampled === false ||
    (sampled == null && !isLangfuseTraceSampled(traceId))
  ) {
    return [];
  }

  if (!usesLangfuseMultiTenantRouting()) {
    return hasLangfuseEnvCredentials()
      ? [getCentralScoreDestination()].filter(
          (destination): destination is LangfuseScoreDestination => Boolean(destination),
        )
      : [getConfiguredScoreDestination(appConfig)].filter(
          (destination): destination is LangfuseScoreDestination => Boolean(destination),
        );
  }

  const destinations = [getCentralScoreDestination(), getTenantScoreDestination(appConfig)].filter(
    (destination): destination is LangfuseScoreDestination => Boolean(destination),
  );
  const seen = new Set<string>();
  return destinations.filter((destination) => {
    const key = `${destination.baseUrl}\n${destination.authorization}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
