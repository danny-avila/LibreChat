import type { OpenAPIV3 } from 'openapi-types';

/**
 * Loads and curates django-hub's drf-spectacular OpenAPI spec into the subset
 * of operations exposed to the LibreChat assistant as native tool calls.
 *
 * Curation gate: only operations flagged `x-llm-callable: true` in the spec are
 * eligible. An optional per-app allowlist (keyed by appId -> operationId[])
 * narrows the catalog further so FedCrim and LitigAI can advertise different
 * tools.
 *
 * Note: django-hub serves `/api/schema/` with IsAdminUser permission, so a live
 * fetch needs a service/admin token (schemaAuthToken). For tests and offline
 * builds a `staticSpec` can be supplied to bypass the network entirely.
 */

const LLM_CALLABLE_EXTENSION = 'x-llm-callable';
const DEFAULT_SCHEMA_PATH = '/api/schema/';
const DEFAULT_REFRESH_SECONDS = 600;

type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'patch';
const HTTP_METHODS: readonly HttpMethod[] = ['get', 'put', 'post', 'delete', 'patch'];

export interface JuristaiSpecConfig {
  djangoBaseUrl: string;
  schemaPath?: string;
  refreshSeconds?: number;
  /** Bearer token used to fetch the admin-gated schema endpoint. */
  schemaAuthToken?: string;
  /** appId -> operationId allowlist. Omit to expose every llm-callable op. */
  perAppOperations?: Record<string, string[]>;
  /** Inject a spec directly (tests, bundled offline spec) and skip fetching. */
  staticSpec?: OpenAPIV3.Document;
}

interface CachedSpec {
  spec: OpenAPIV3.Document;
  fetchedAtMs: number;
}

const cache = new Map<string, CachedSpec>();

const isLlmCallable = (operation: OpenAPIV3.OperationObject): boolean => {
  const flagged = (operation as Record<string, unknown>)[LLM_CALLABLE_EXTENSION];
  return flagged === true;
};

const buildSchemaUrl = (config: JuristaiSpecConfig): string => {
  const base = config.djangoBaseUrl.replace(/\/+$/, '');
  const path = config.schemaPath ?? DEFAULT_SCHEMA_PATH;
  const separator = path.includes('?') ? '&' : '?';
  return `${base}${path}${separator}format=json`;
};

const getCacheKey = (config: JuristaiSpecConfig): string =>
  `${buildSchemaUrl(config)}::${config.refreshSeconds ?? DEFAULT_REFRESH_SECONDS}::${config.schemaAuthToken ? 'auth' : 'anon'}`;

const fetchSpec = async (config: JuristaiSpecConfig): Promise<OpenAPIV3.Document> => {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.schemaAuthToken) {
    headers.Authorization = `Bearer ${config.schemaAuthToken}`;
  }

  const response = await fetch(buildSchemaUrl(config), { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch django-hub schema: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as OpenAPIV3.Document;
};

const isFresh = (config: JuristaiSpecConfig): boolean => {
  const cachedSpec = cache.get(getCacheKey(config));
  if (!cachedSpec) {
    return false;
  }
  const ttlMs = (config.refreshSeconds ?? DEFAULT_REFRESH_SECONDS) * 1000;
  return Date.now() - cachedSpec.fetchedAtMs < ttlMs;
};

/** Fetches (or returns cached) the raw django-hub OpenAPI spec. */
export async function loadDjangoSpec(
  config: JuristaiSpecConfig,
  forceRefresh = false,
): Promise<OpenAPIV3.Document> {
  if (config.staticSpec) {
    return config.staticSpec;
  }
  const cacheKey = getCacheKey(config);
  if (!forceRefresh && isFresh(config)) {
    return cache.get(cacheKey)!.spec;
  }
  const spec = await fetchSpec(config);
  cache.set(cacheKey, { spec, fetchedAtMs: Date.now() });
  return spec;
}

const operationIdFor = (
  operation: OpenAPIV3.OperationObject,
  method: string,
  path: string,
): string => operation.operationId ?? `${method}_${path}`;

/**
 * Returns a spec containing only the llm-callable operations allowed for the
 * given appId. The result is a valid OpenAPIV3.Document suitable for
 * `openapiToFunction`.
 */
export function filterSpecForApp(
  spec: OpenAPIV3.Document,
  config: JuristaiSpecConfig,
  appId?: string,
): OpenAPIV3.Document {
  const allowlist =
    appId != null && config.perAppOperations ? config.perAppOperations[appId] : undefined;
  const allowed = allowlist ? new Set(allowlist) : null;

  const filteredPaths: OpenAPIV3.PathsObject = {};

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem) {
      continue;
    }
    const keptMethods: Partial<Record<HttpMethod, OpenAPIV3.OperationObject>> = {};

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || !isLlmCallable(operation)) {
        continue;
      }
      if (allowed && !allowed.has(operationIdFor(operation, method, path))) {
        continue;
      }
      keptMethods[method] = operation;
    }

    if (Object.keys(keptMethods).length > 0) {
      filteredPaths[path] = { ...keptMethods };
    }
  }

  return { ...spec, paths: filteredPaths };
}

export function clearSpecCache(): void {
  cache.clear();
}
