import { createHash } from 'node:crypto';
import { logger, type AppConfig } from '@librechat/data-schemas';
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
const PROJECT_LOOKUP_TIMEOUT_MS = 10_000;
const PROJECT_LOOKUP_RETRY_MS = 30_000;
type CentralProjectIdCacheEntry = {
  projectId?: string;
  lookup?: Promise<string | undefined>;
  retryAt: number;
};
const centralProjectIdCache = new Map<string, CentralProjectIdCacheEntry>();

export type LangfuseScoreDestination = {
  id?: string;
  name: 'central' | 'tenant' | 'connection';
  baseUrl: string;
  authorization: string;
};

function getDestinationId(baseUrl: string, projectId: string): string {
  return createHash('sha256')
    .update(`${baseUrl.replace(/\/+$/, '')}\n${projectId}`)
    .digest('hex');
}

function getCentralEnvBaseUrl(): string {
  return (
    normalizeString(process.env.LANGFUSE_BASE_URL) ??
    normalizeString(process.env.LANGFUSE_HOST) ??
    normalizeString(process.env.LANGFUSE_BASEURL) ??
    DEFAULT_BASE_URL
  );
}

async function resolveCentralProjectId(
  baseUrl: string,
  publicKey: string,
  secretKey: string,
  waitForLookup: boolean,
): Promise<string | undefined> {
  const configuredProjectId = normalizeString(process.env.LANGFUSE_PROJECT_ID);
  if (configuredProjectId) {
    return configuredProjectId;
  }

  const cacheKey = createHash('sha256')
    .update(`${baseUrl}\n${publicKey}\n${secretKey}`)
    .digest('hex');
  const cached = centralProjectIdCache.get(cacheKey) ?? { retryAt: 0 };
  centralProjectIdCache.set(cacheKey, cached);
  if (cached.projectId) {
    return cached.projectId;
  }

  if (!cached.lookup && Date.now() >= cached.retryAt) {
    cached.lookup = (async () => {
      try {
        const response = await fetch(`${baseUrl}/api/public/projects`, {
          headers: { Authorization: toBasicAuthorization(publicKey, secretKey) },
          signal: AbortSignal.timeout(PROJECT_LOOKUP_TIMEOUT_MS),
        });
        if (!response.ok) {
          logger.warn(
            `[langfuse] Could not resolve central project identity: Langfuse responded with ${response.status}`,
          );
          return undefined;
        }

        const projects: unknown = await response.json();
        const projectId =
          projects != null &&
          typeof projects === 'object' &&
          Array.isArray((projects as { data?: unknown }).data) &&
          (projects as { data: unknown[] }).data.length === 1 &&
          typeof (projects as { data: Array<{ id?: unknown }> }).data[0]?.id === 'string'
            ? (projects as { data: Array<{ id: string }> }).data[0].id.trim()
            : '';
        if (!projectId) {
          logger.warn(
            '[langfuse] Could not resolve central project identity from Langfuse response',
          );
          return undefined;
        }
        return projectId;
      } catch (error) {
        logger.warn('[langfuse] Could not resolve central project identity:', error);
        return undefined;
      }
    })().then((projectId) => {
      cached.lookup = undefined;
      if (projectId) {
        cached.projectId = projectId;
      } else {
        cached.retryAt = Date.now() + PROJECT_LOOKUP_RETRY_MS;
      }
      return projectId;
    });
  }

  return waitForLookup && cached.lookup ? cached.lookup : undefined;
}

async function getCentralScoreDestination(
  waitForProjectId: boolean,
): Promise<LangfuseScoreDestination | undefined> {
  // Central feedback scores are sent directly by the app, not through the
  // collector, so they use LibreChat's normal central Langfuse credentials.
  // LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER is intentionally collector-only.
  const publicKey = normalizeString(process.env.LANGFUSE_PUBLIC_KEY);
  const secretKey = normalizeString(process.env.LANGFUSE_SECRET_KEY);
  if (!publicKey || !secretKey) {
    return undefined;
  }

  const baseUrl = getCentralEnvBaseUrl();
  const projectId = await resolveCentralProjectId(baseUrl, publicKey, secretKey, waitForProjectId);
  return {
    id: projectId ? getDestinationId(baseUrl, projectId) : undefined,
    name: 'central',
    baseUrl,
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
    id: config?.projectId ? getDestinationId(destination.baseUrl, config.projectId) : undefined,
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
    id: config?.projectId ? getDestinationId(destination.baseUrl, config.projectId) : undefined,
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
export async function getScoreDestinations(
  appConfig: AppConfig | undefined,
  traceId: string,
  sampled?: boolean,
  options?: { waitForCentralProjectId?: boolean },
): Promise<LangfuseScoreDestination[]> {
  if (
    !isLangfuseTracingEnabled() ||
    sampled === false ||
    (sampled == null && !isLangfuseTraceSampled(traceId))
  ) {
    return [];
  }

  if (!usesLangfuseMultiTenantRouting()) {
    return hasLangfuseEnvCredentials()
      ? [await getCentralScoreDestination(options?.waitForCentralProjectId !== false)].filter(
          (destination): destination is LangfuseScoreDestination => Boolean(destination),
        )
      : [getConfiguredScoreDestination(appConfig)].filter(
          (destination): destination is LangfuseScoreDestination => Boolean(destination),
        );
  }

  const destinations = [
    await getCentralScoreDestination(options?.waitForCentralProjectId !== false),
    getTenantScoreDestination(appConfig),
  ].filter((destination): destination is LangfuseScoreDestination => Boolean(destination));
  const unique = new Map<string, LangfuseScoreDestination>();
  for (const destination of destinations) {
    const deduplicationKey = `${destination.baseUrl}\n${destination.authorization}`;
    const existing = unique.get(deduplicationKey);
    if (
      existing == null ||
      (existing.name === 'central' && destination.name !== 'central' && destination.id != null)
    ) {
      unique.set(deduplicationKey, destination);
    }
  }
  return [...unique.values()];
}

/**
 * Captures the concrete Langfuse projects eligible to receive a generated
 * trace. The opaque IDs let later feedback avoid newly configured or replaced
 * destinations without persisting credentials on the message.
 */
export async function getLangfuseTraceDestinationIds(
  appConfig: AppConfig | undefined,
  traceId: string,
  sampled?: boolean,
): Promise<string[] | undefined> {
  const destinations = await getScoreDestinations(appConfig, traceId, sampled, {
    waitForCentralProjectId: false,
  });
  if (destinations.some(({ id }) => id == null)) {
    return undefined;
  }
  return destinations.map(({ id }) => id as string);
}

const centralPublicKey = normalizeString(process.env.LANGFUSE_PUBLIC_KEY);
const centralSecretKey = normalizeString(process.env.LANGFUSE_SECRET_KEY);
if (centralPublicKey && centralSecretKey) {
  void resolveCentralProjectId(getCentralEnvBaseUrl(), centralPublicKey, centralSecretKey, false);
}
