import type { AppConfig } from '@librechat/data-schemas';
import { isFalseEnv, normalizeString, toBasicAuthorization } from './utils';
import { resolveLangfuseTenantDestination } from './tenantDestinations';

const DEFAULT_BASE_URL = 'https://cloud.langfuse.com';

export type LangfuseScoreDestination = {
  name: 'central' | 'tenant';
  baseUrl: string;
  authorization: string;
};

function isSampleRateEnabled(value?: string): boolean {
  if (value == null || value.trim() === '') {
    return true;
  }
  const parsed = Number(value);
  return !Number.isFinite(parsed) || parsed !== 0;
}

function isTracingEnabled(): boolean {
  return (
    !isFalseEnv(process.env.LANGFUSE_TRACING_ENABLED) &&
    isSampleRateEnabled(process.env.LANGFUSE_SAMPLE_RATE)
  );
}

function getLegacyBaseUrl(): string {
  return (
    normalizeString(process.env.LANGFUSE_BASE_URL) ??
    normalizeString(process.env.LANGFUSE_HOST) ??
    normalizeString(process.env.LANGFUSE_BASEURL) ??
    DEFAULT_BASE_URL
  );
}

function getCentralScoreDestination(): LangfuseScoreDestination | undefined {
  if (!isTracingEnabled()) {
    return undefined;
  }

  const fanoutAuthorization = normalizeString(process.env.LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER);
  if (fanoutAuthorization) {
    return {
      name: 'central',
      baseUrl: normalizeString(process.env.LANGFUSE_FANOUT_CENTRAL_BASE_URL) ?? DEFAULT_BASE_URL,
      authorization: fanoutAuthorization,
    };
  }

  const publicKey = normalizeString(process.env.LANGFUSE_PUBLIC_KEY);
  const secretKey = normalizeString(process.env.LANGFUSE_SECRET_KEY);
  if (!publicKey || !secretKey) {
    return undefined;
  }

  return {
    name: 'central',
    baseUrl: getLegacyBaseUrl(),
    authorization: toBasicAuthorization(publicKey, secretKey),
  };
}

function getTenantScoreDestination(appConfig?: AppConfig): LangfuseScoreDestination | undefined {
  if (!isTracingEnabled()) {
    return undefined;
  }
  if (isFalseEnv(process.env.LANGFUSE_FANOUT_TENANT_EXPORT_ENABLED)) {
    return undefined;
  }

  const config = appConfig?.langfuse;
  if (config?.enabled === false) {
    return undefined;
  }

  const publicKey = normalizeString(config?.publicKey);
  const secretKey = normalizeString(config?.secretKey);
  if (!publicKey || !secretKey) {
    return undefined;
  }
  const destination = resolveLangfuseTenantDestination(config?.baseUrl);
  if (!destination) {
    return undefined;
  }

  return {
    name: 'tenant',
    baseUrl: destination.baseUrl,
    authorization: toBasicAuthorization(publicKey, secretKey),
  };
}

/**
 * Score fanout uses Langfuse's direct REST API. Trace fanout may use the OTLP
 * collector via appConfig.langfuse.fanout.collectorUrl/LANGFUSE_FANOUT_COLLECTOR_URL.
 */
export function getScoreDestinations(appConfig?: AppConfig): LangfuseScoreDestination[] {
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
