import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { collectLeafPaths, flattenObject, isConfigRecord } from '~/admin/utils';
import { BASE_CONFIG_PRINCIPAL_ID } from '../constants';
import { createServerFn } from '~/admin/api/utils/fn';
import { normalizeAppServiceKeys } from './normalize';
import { extractSchemaDefaults } from './schema';
import { queryOptions } from '~/admin/query';
import { apiFetch } from '../utils/api';

/**
 * AppConfig keys that are runtime state, not settings: server filesystem
 * paths, the tool registry, and the nested raw librechat.yaml (read here and
 * reduced to `yamlPaths`). They never reach the browser (EV-7).
 */
const APP_SERVICE_INTERNAL_KEYS: ReadonlySet<string> = new Set([
  'paths',
  'config',
  'availableTools',
]);

interface AppConfigPayload {
  config: t.ConfigRecord;
}

/** A normalized AppConfig without its runtime internals. */
function toConfigLayer(appConfig: t.ConfigRecord): t.ConfigRecord {
  const settings: t.ConfigRecord = {};
  for (const [key, value] of Object.entries(appConfig)) {
    if (!APP_SERVICE_INTERNAL_KEYS.has(key)) settings[key] = value;
  }
  return normalizeAppServiceKeys(settings);
}

function readSchemaDefaults(): t.FlatConfigMap {
  try {
    const defaults = extractSchemaDefaults(configSchema as t.ZodSchemaLike);
    return flattenObject(defaults as t.ConfigRecord);
  } catch (e) {
    console.warn('[getBaseConfigFn] Failed to compute schema defaults:', e);
    return {};
  }
}

async function readOverrideDoc(
  response: Response,
): Promise<Pick<t.BaseConfigData, 'dbOverrides' | 'dbTombstones'>> {
  if (!response.ok) return { dbOverrides: undefined, dbTombstones: [] };
  const { config } = (await response.json()) as t.AdminConfigDocResponse;
  return {
    dbOverrides: (config.overrides ?? {}) as t.ConfigRecord,
    dbTombstones: config.tombstones ?? [],
  };
}

/**
 * The layers of the base configuration (EV-1):
 * - `config`: effective base (librechat.yaml + base overrides);
 * - `yamlConfig`: librechat.yaml as LibreChat processes it (`?baseOnly=true`),
 *   which is what a base field reverts to;
 * - `yamlPaths`: what the raw librechat.yaml itself sets. Values LibreChat
 *   synthesizes at startup appear in both trees above but not here, so they
 *   are not counted as configured (EV-2);
 * - `dbOverrides`/`dbTombstones`: the base admin override document;
 * - `schemaDefaults`: flattened schema defaults.
 */
export const getBaseConfigFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<t.BaseConfigData> => {
    const [baseResponse, baseOnlyResponse, dbBaseResponse] = await Promise.all([
      apiFetch('/api/admin/config/base'),
      apiFetch('/api/admin/config/base?baseOnly=true'),
      apiFetch(`/api/admin/config/role/${BASE_CONFIG_PRINCIPAL_ID}`),
    ]);

    if (!baseResponse.ok) {
      throw new Error(`Failed to fetch base config: ${baseResponse.status}`);
    }

    const { config: appConfig } = (await baseResponse.json()) as AppConfigPayload;
    const rawYaml = appConfig.config;
    const yamlPaths = isConfigRecord(rawYaml) ? collectLeafPaths(rawYaml) : [];

    let yamlConfig: t.ConfigRecord | undefined;
    let yamlMcpKeys: string[] | undefined;
    let yamlMcpServers: Record<string, t.ConfigValue> | undefined;
    if (baseOnlyResponse.ok) {
      const { config: baseOnlyConfig } = (await baseOnlyResponse.json()) as AppConfigPayload;
      yamlConfig = toConfigLayer(baseOnlyConfig);
      const mcp = yamlConfig.mcpServers;
      if (isConfigRecord(mcp)) {
        yamlMcpServers = mcp;
        yamlMcpKeys = Object.keys(mcp);
      }
    }

    return {
      config: toConfigLayer(appConfig),
      yamlConfig,
      yamlPaths,
      ...(await readOverrideDoc(dbBaseResponse)),
      schemaDefaults: readSchemaDefaults(),
      yamlMcpKeys,
      yamlMcpServers,
    };
  },
);

export const baseConfigOptions = queryOptions({
  queryKey: ['baseConfig'],
  queryFn: () => getBaseConfigFn(),
  staleTime: 30_000,
});
