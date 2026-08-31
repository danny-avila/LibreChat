import type { TDefaultLLMDeliveryPath, TDefaultLLMDeliveryPathConfig } from './file-config';
import { isDocumentSupportedProvider, isMediaSupportedProvider } from './schemas';

/** Audio and video reach the model only through the media encoders, which support a
 *  narrower provider set than documents. Images use the broadly supported vision
 *  path and are never gated here. */
const isProviderCapable = (mimeType: string, endpoint: string): boolean => {
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
    return isMediaSupportedProvider(endpoint);
  }
  if (mimeType === 'application/pdf') {
    return isDocumentSupportedProvider(endpoint);
  }
  return true;
};

export const SYSTEM_LLM_DELIVERY_DEFAULTS: Required<TDefaultLLMDeliveryPathConfig> = {
  fallback: 'text',
  overrides: {
    'image/*': 'provider',
    'video/*': 'provider',
    'audio/*': 'provider',
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
  endpoint?: string,
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

  const systemDefault = (SYSTEM_LLM_DELIVERY_DEFAULTS.overrides[mimeType] ??
    SYSTEM_LLM_DELIVERY_DEFAULTS.overrides[wildcard] ??
    SYSTEM_LLM_DELIVERY_DEFAULTS.fallback) as TDefaultLLMDeliveryPath;

  /** Only the system default is capability-gated: an explicit config above is the
   *  admin's decision. A known endpoint that cannot encode documents or media would
   *  otherwise accept the upload and hand the model nothing at all. */
  if (systemDefault === 'provider' && endpoint != null && !isProviderCapable(mimeType, endpoint)) {
    return 'text';
  }

  return systemDefault;
}
