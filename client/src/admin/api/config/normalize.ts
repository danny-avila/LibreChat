import type * as t from '~/admin/types';
import { stripInterfacePermissionFields } from '~/admin/utils';
import { APP_SERVICE_KEY_ALIASES } from '~/admin/constants';

const AZURE_OPENAI_DERIVED_KEYS = new Set([
  'assistantGroups',
  'errors',
  'isValid',
  'groupMap',
  'modelNames',
  'modelGroupMap',
  'assistantModels',
  'serverless',
  'instanceName',
  'deploymentName',
]);

function normalizeEndpointValue(value: t.ConfigValue): t.ConfigValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const obj = value as Record<string, t.ConfigValue>;
  if ('groupMap' in obj && 'isValid' in obj) {
    const groupMap = obj.groupMap;
    const cleaned: Record<string, t.ConfigValue> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (AZURE_OPENAI_DERIVED_KEYS.has(k)) continue;
      cleaned[k] = v;
    }
    if (groupMap && typeof groupMap === 'object' && !Array.isArray(groupMap)) {
      cleaned.groups = Object.entries(groupMap as Record<string, t.ConfigValue>).map(
        ([group, config]) => ({
          group,
          ...(typeof config === 'object' && config !== null && !Array.isArray(config)
            ? (config as Record<string, t.ConfigValue>)
            : {}),
        }),
      );
    }
    return cleaned;
  }
  return value;
}

/** Maps AppService output back to canonical config keys and drops derived endpoint state. */
export function normalizeAppServiceKeys(
  raw: Record<string, t.ConfigValue>,
): Record<string, t.ConfigValue> {
  const result: Record<string, t.ConfigValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[APP_SERVICE_KEY_ALIASES[key] ?? key] = value;
  }
  if (
    result.interface &&
    typeof result.interface === 'object' &&
    !Array.isArray(result.interface)
  ) {
    result.interface = stripInterfacePermissionFields(
      result.interface as Record<string, unknown>,
    ) as t.ConfigValue;
  }
  if (
    result.endpoints &&
    typeof result.endpoints === 'object' &&
    !Array.isArray(result.endpoints)
  ) {
    const endpoints = { ...(result.endpoints as Record<string, t.ConfigValue>) };
    result.endpoints = endpoints;
    for (const [epKey, epValue] of Object.entries(endpoints)) {
      endpoints[epKey] = normalizeEndpointValue(epValue);
    }
  }
  return result;
}
