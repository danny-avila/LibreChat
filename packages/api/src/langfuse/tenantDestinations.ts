import { normalizeString } from '~/utils/text';

const DEFAULT_TENANT_DESTINATIONS: Array<[string, string]> = [
  ['eu', 'https://cloud.langfuse.com'],
  ['us', 'https://us.cloud.langfuse.com'],
  ['jp', 'https://jp.cloud.langfuse.com'],
];

const DESTINATIONS_ENV = 'LANGFUSE_FANOUT_TENANT_DESTINATIONS';
const LEGACY_TENANT_BASE_URL_ENV = 'LANGFUSE_FANOUT_TENANT_BASE_URL';

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

  const legacyBaseUrl = normalizeBaseUrl(process.env[LEGACY_TENANT_BASE_URL_ENV]);
  const defaults = DEFAULT_TENANT_DESTINATIONS.map(([key, defaultBaseUrl]) => ({
    key,
    baseUrl:
      normalizeBaseUrl(process.env[destinationEnvName(key)]) ??
      (key === 'eu' ? legacyBaseUrl : undefined) ??
      defaultBaseUrl,
  }));

  return uniqueDestinations(defaults);
}

export function resolveLangfuseTenantDestination(
  baseUrl: unknown,
): LangfuseTenantDestination | undefined {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return undefined;
  }

  return getLangfuseTenantDestinations().find(
    (destination) => destination.baseUrl === normalizedBaseUrl,
  );
}
