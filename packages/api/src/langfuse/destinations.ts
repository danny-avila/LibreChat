import type { AppConfig } from '@librechat/data-schemas';
import type { LangfuseFanoutConfig } from './config';
import {
  isFalseEnv,
  normalizeBoolean,
  resolveTenantCredentials,
  toBasicAuthorization,
} from './utils';
import { isLangfuseFanoutEnabled, isLangfuseTenantExportEnabled } from './config';
import { resolveLangfuseTenantDestination } from './tenantDestinations';
import { normalizeString } from '~/utils/text';

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

function getCentralEnvBaseUrl(): string {
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
  if (!isTracingEnabled()) {
    return undefined;
  }
  if (!isLangfuseTenantExportEnabled()) {
    return undefined;
  }

  const config = appConfig?.langfuse;
  if (normalizeBoolean(config?.enabled) === false) {
    return undefined;
  }
  const fanout = config?.fanout as LangfuseFanoutConfig | undefined;
  if (!isLangfuseFanoutEnabled(fanout)) {
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

/**
 * Score fanout uses Langfuse's direct REST API. The deployment-level collector
 * URL is still required so tenant score fanout follows trace fanout availability.
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
