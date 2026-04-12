import type { TDefaultLLMDeliveryPath, TDefaultLLMDeliveryPathConfig } from './file-config';

export const SYSTEM_LLM_DELIVERY_DEFAULTS: Required<TDefaultLLMDeliveryPathConfig> = {
  fallback: 'text',
  overrides: {
    'image/*': 'provider',
    'application/pdf': 'provider',
  },
};

/**
 * Resolves the default file path destination for a given mime type.
 * Resolution chain: endpoint overrides -> endpoint fallback -> global overrides -> global fallback -> system defaults.
 */
export function resolveDefaultLLMDeliveryPath(
  mimeType: string,
  endpointConfig?: TDefaultLLMDeliveryPathConfig,
  globalConfig?: TDefaultLLMDeliveryPathConfig,
): TDefaultLLMDeliveryPath {
  const wildcard = mimeType.split('/')[0] + '/*';

  if (endpointConfig?.overrides) {
    if (endpointConfig.overrides[mimeType]) {
      return endpointConfig.overrides[mimeType] as TDefaultLLMDeliveryPath;
    }
    if (endpointConfig.overrides[wildcard]) {
      return endpointConfig.overrides[wildcard] as TDefaultLLMDeliveryPath;
    }
  }

  if (endpointConfig?.fallback) {
    return endpointConfig.fallback;
  }

  if (globalConfig?.overrides) {
    if (globalConfig.overrides[mimeType]) {
      return globalConfig.overrides[mimeType] as TDefaultLLMDeliveryPath;
    }
    if (globalConfig.overrides[wildcard]) {
      return globalConfig.overrides[wildcard] as TDefaultLLMDeliveryPath;
    }
  }

  if (globalConfig?.fallback) {
    return globalConfig.fallback;
  }

  if (SYSTEM_LLM_DELIVERY_DEFAULTS.overrides[mimeType]) {
    return SYSTEM_LLM_DELIVERY_DEFAULTS.overrides[mimeType] as TDefaultLLMDeliveryPath;
  }
  if (SYSTEM_LLM_DELIVERY_DEFAULTS.overrides[wildcard]) {
    return SYSTEM_LLM_DELIVERY_DEFAULTS.overrides[wildcard] as TDefaultLLMDeliveryPath;
  }

  return SYSTEM_LLM_DELIVERY_DEFAULTS.fallback;
}
