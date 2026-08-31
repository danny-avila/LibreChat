import type { TDefaultLLMDeliveryPath, TDefaultLLMDeliveryPathConfig } from './file-config';
import type { EndpointFileConfig, FileConfig } from './types/files';
import {
  EModelEndpoint,
  isDocumentSupportedProvider,
  isKnownProviderIdentifier,
  isMediaSupportedProvider,
} from './schemas';
import { isBedrockDocumentType } from './file-config';
import { EToolResources } from './types/assistants';

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

/** Whether some step could turn this type into text: documents parse, images OCR, and
 *  audio transcribes. Video has no such step. */
function hasTextExtractionPath(mimeType: string): boolean {
  return !mimeType.startsWith('video/');
}

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
  /** `agents` is a container, not a provider: it is what an upload reports when the
   *  agent's real provider could not be resolved, as for ephemeral agents. A custom
   *  endpoint name is likewise unresolvable here, since its real provider is chosen
   *  at request time and is usually OpenAI- or Anthropic-compatible. Judging
   *  capability from either would downgrade media the actual provider can deliver,
   *  so an unresolved provider keeps the system default. */
  const providerKnown =
    endpoint != null && endpoint !== EModelEndpoint.agents && isKnownProviderIdentifier(endpoint);
  if (systemDefault === 'provider' && providerKnown && !isProviderCapable(mimeType, endpoint)) {
    /* Downgrading is only useful where text can actually be recovered. Video has no
     * extraction step: speech-to-text covers audio, and the default text matcher accepts
     * any well-formed MIME type, so routing it to text ends in the raw bytes being
     * decoded as UTF-8 and handed to the model. Keep it off the model path instead; the
     * file is still stored and still reachable by tools. */
    return hasTextExtractionPath(mimeType) ? 'text' : 'none';
  }

  /** Bedrock's Converse document path natively accepts more than PDF, so on that
   *  endpoint its document types belong on the provider path rather than being
   *  extracted, which would drop non-text content and layout. */
  if (
    systemDefault !== 'provider' &&
    endpoint === EModelEndpoint.bedrock &&
    isBedrockDocumentType(mimeType)
  ) {
    return 'provider';
  }

  return systemDefault;
}

/**
 * Delivery path for an upload that named no tool resource. The legacy chooser makes the
 * destination explicit, so nothing is inferred there.
 */
export function resolveDefaultUploadLLMDeliveryPath({
  mimeType,
  endpointConfig,
  fileConfig,
  endpoint,
}: {
  mimeType: string;
  endpointConfig?: EndpointFileConfig;
  fileConfig?: FileConfig;
  endpoint?: string;
}): TDefaultLLMDeliveryPath {
  if (endpointConfig?.legacyFileUploadUX === true) {
    return 'provider';
  }
  return resolveDefaultLLMDeliveryPath(
    mimeType,
    endpointConfig?.defaultLLMDeliveryPath,
    fileConfig?.defaultLLMDeliveryPath,
    endpoint,
  );
}

/** Delivery path for an upload, honoring an explicitly chosen tool resource. */
export function resolveUploadLLMDeliveryPath({
  toolResource,
  mimeType,
  endpointConfig,
  fileConfig,
  endpoint,
}: {
  toolResource?: string | null;
  mimeType: string;
  endpointConfig?: EndpointFileConfig;
  fileConfig?: FileConfig;
  endpoint?: string;
}): TDefaultLLMDeliveryPath {
  if (toolResource === EToolResources.context || toolResource === EToolResources.ocr) {
    return 'text';
  }
  if (toolResource === EToolResources.file_search || toolResource === EToolResources.execute_code) {
    return 'none';
  }
  return resolveDefaultUploadLLMDeliveryPath({ mimeType, endpointConfig, fileConfig, endpoint });
}
