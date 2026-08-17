import { normalizeString } from '~/utils/text';

const DEFAULT_TENANT_DESTINATIONS: Array<[string, string]> = [
  ['eu', 'https://cloud.langfuse.com'],
  ['us', 'https://us.cloud.langfuse.com'],
  ['jp', 'https://jp.cloud.langfuse.com'],
];

const DESTINATIONS_ENV = 'LANGFUSE_FANOUT_TENANT_DESTINATIONS';

export type LangfuseTenantDestination = {
  key: string;
  baseUrl: string;
};

function normalizeDestinationKey(value: string): string | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_');
  return /^[a-z][a-z0-9_-]*$/.test(normalized) ? normalized : undefined;
}

function normalizeBaseUrl(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined;
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

function destinationEnvName(key: string): string {
  return `LANGFUSE_FANOUT_TENANT_${key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_BASE_URL`;
}

function parseDestinationList(value: string | undefined): LangfuseTenantDestination[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const index = item.indexOf('=');
      if (index < 0) {
        return undefined;
      }
      const key = normalizeDestinationKey(item.slice(0, index));
      const baseUrl = normalizeBaseUrl(item.slice(index + 1));
      return key && baseUrl ? { key, baseUrl } : undefined;
    })
    .filter((destination): destination is LangfuseTenantDestination => Boolean(destination));
}

function uniqueDestinations(
  destinations: LangfuseTenantDestination[],
): LangfuseTenantDestination[] {
  const byKey = new Map<string, LangfuseTenantDestination>();
  for (const destination of destinations) {
    byKey.set(destination.key, destination);
  }
  return [...byKey.values()];
}

export function getLangfuseTenantDestinations(): LangfuseTenantDestination[] {
  const configuredValue = normalizeString(process.env[DESTINATIONS_ENV]);
  const configured = parseDestinationList(configuredValue);
  if (configuredValue) {
    return uniqueDestinations(configured);
  }

  const defaults = DEFAULT_TENANT_DESTINATIONS.map(([key, defaultBaseUrl]) => ({
    key,
    baseUrl: normalizeBaseUrl(process.env[destinationEnvName(key)]) ?? defaultBaseUrl,
  }));

  return uniqueDestinations(defaults);
}

function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Origins the deployment explicitly pointed Langfuse traffic at — a self-hosted
 * base URL, the fanout collector, or a tenant destination whose URL was set by
 * env. The built-in `*.cloud.langfuse.com` defaults are deliberately excluded:
 * they are third-party origins nobody configured.
 */
function getConfiguredLangfuseOrigins(): Set<string> {
  const origins = new Set<string>();
  const add = (value: unknown): void => {
    const baseUrl = normalizeBaseUrl(value);
    const origin = baseUrl ? originOf(baseUrl) : undefined;
    if (origin) {
      origins.add(origin);
    }
  };

  add(process.env.LANGFUSE_BASE_URL);
  add(process.env.LANGFUSE_HOST);
  add(process.env.LANGFUSE_BASEURL);
  add(process.env.LANGFUSE_FANOUT_COLLECTOR_URL);

  const configuredList = normalizeString(process.env[DESTINATIONS_ENV]);
  if (configuredList) {
    for (const destination of parseDestinationList(configuredList)) {
      add(destination.baseUrl);
    }
    return origins;
  }

  for (const [key] of DEFAULT_TENANT_DESTINATIONS) {
    add(process.env[destinationEnvName(key)]);
  }
  return origins;
}

/**
 * Whether custom Langfuse headers may be sent to `baseUrl`.
 *
 * A deployment configures one header map, but a run can resolve to several
 * destinations (central plus tenant under fanout). Broadcasting the map would
 * disclose a credential meant for an internal gateway to whatever unrelated
 * origin the other destination points at — Langfuse Cloud, typically. Sending
 * only to explicitly configured origins keeps the credential where it was
 * aimed while leaving the single-destination self-hosted case unaffected.
 */
export function allowsLangfuseCustomHeaders(baseUrl: string): boolean {
  const origin = originOf(baseUrl);
  return origin != null && getConfiguredLangfuseOrigins().has(origin);
}

export function resolveLangfuseTenantDestination(
  destinationKey: unknown,
): LangfuseTenantDestination | undefined {
  const normalizedKey = normalizeString(destinationKey);
  if (!normalizedKey) {
    return undefined;
  }

  const key = normalizeDestinationKey(normalizedKey);
  if (!key) {
    return undefined;
  }

  return getLangfuseTenantDestinations().find((destination) => destination.key === key);
}
