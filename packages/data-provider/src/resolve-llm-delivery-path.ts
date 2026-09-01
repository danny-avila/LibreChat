import type { TDefaultLLMDeliveryPath, TDefaultLLMDeliveryPathConfig } from './file-config';
import type { EndpointFileConfig, FileConfig } from './types/files';
import {
  EModelEndpoint,
  isDocumentSupportedProvider,
  isKnownProviderIdentifier,
  isMediaSupportedProvider,
} from './schemas';
import { isBedrockDocumentType, codeInterpreterMimeTypes } from './file-config';
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

/**
 * Types some step in the upload pipeline can turn into text: natively readable text,
 * documents a parser or OCR handles, images through OCR, and audio through transcription.
 *
 * Everything absent from this list, notably archives, tarballs, columnar data files and
 * video, has no such step, and the default text matcher accepts any well-formed type, so
 * routing them to text ends in their bytes being decoded as UTF-8.
 */
const TEXT_RECOVERABLE_MIME_TYPES: RegExp[] = [
  /^text\//,
  /^image\//,
  /^audio\//,
  /^application\/(json|javascript|xml|sql|yaml|x-yaml|csv|typescript|x-sh|vnd\.coffeescript)$/,
  /^application\/pdf$/,
  /* Only the formats the built-in document parser handles. Presentations and graphics
   * are absent from documentParserMimeTypes, so on a deployment without OCR they would
   * fall through to the permissive text matcher and be decoded as ZIP bytes. */
  /^application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)$/,
  /^application\/vnd\.oasis\.opendocument\.(text|spreadsheet)$/,
  /^application\/(vnd\.ms-excel|x-msexcel|msexcel|x-ms-excel|x-excel|x-dos_ms_excel|xls|x-xls)$/,
  /^message\/rfc822$/,
];

/**
 * Types whose bytes are text already, so reading them directly is meaningful. Everything
 * else needs a real extractor: decoding it as UTF-8 produces mojibake rather than content.
 */
/** Application types whose payload is text. Mirrors the set the content-protection code
 *  treats as textual, plus the source and data formats this pipeline also accepts. */
const TEXTUAL_APPLICATION_MIME_TYPES = new Set([
  'application/json',
  'application/javascript',
  'application/sql',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/csv',
  'application/typescript',
  'application/x-sh',
  'application/vnd.coffeescript',
]);

export function isNativelyReadableText(mimeType: string): boolean {
  const normalized = mimeType.split(';', 1)[0].trim().toLowerCase();
  return (
    normalized.startsWith('text/') ||
    TEXTUAL_APPLICATION_MIME_TYPES.has(normalized) ||
    normalized === 'message/rfc822'
  );
}

export function hasTextExtractionPath(mimeType: string): boolean {
  return TEXT_RECOVERABLE_MIME_TYPES.some((pattern) => pattern.test(mimeType));
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

  /* The text fallback is only meaningful where text can be recovered. An archive or a
   * columnar data file reaching it would be decoded as UTF-8 into the prompt, so keep it
   * off the model path instead; the file is still stored and reachable by tools. An
   * explicit configuration above has already returned, so this governs the system default
   * alone. */
  if (systemDefault === 'text' && !hasTextExtractionPath(mimeType)) {
    return 'none';
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

/**
 * Whether a file tool can do anything with this type. `file_search` indexes extracted
 * text, so it needs a type some step can turn into text and cannot use media, whose
 * extraction paths are OCR and speech rather than the vector store. Code execution is
 * judged by the list the client offers it from. Shared by upload-time selection and
 * deferred provisioning so the two cannot queue a file the other would refuse.
 */
export function canToolResourceConsume(toolResource: string, mimeType: string): boolean {
  if (toolResource === EToolResources.file_search) {
    return (
      !mimeType.startsWith('image') &&
      !mimeType.startsWith('audio') &&
      !mimeType.startsWith('video') &&
      hasTextExtractionPath(mimeType)
    );
  }
  if (toolResource === EToolResources.execute_code) {
    return matchesMimeList(mimeType, codeInterpreterMimeTypes);
  }
  return true;
}

const matchesMimeList = (mimeType: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(mimeType));

/** Why an upload cannot be accepted, when nothing would be able to read it. */
export type UploadRejection = 'no-agent-resource' | 'context-disabled' | 'no-consumer';

/**
 * Where a unified upload will end up, and whether it can be accepted at all.
 *
 * An upload has to be readable by something: the model, an extraction step, or a file
 * tool. A permanent one has to land on an agent resource too, or storing it succeeds
 * while leaving the agent no reference to it. Both outcomes are decided here rather than
 * discovered later, so a request that would change nothing is refused with a reason.
 *
 * `agentTools` is undefined when no agent record backs the upload, as for an ephemeral
 * agent that exists only for the request. An unknown tool set is not judged.
 */
export function resolveUploadDestination(params: {
  toolResource?: string | null;
  deliveryPath: TDefaultLLMDeliveryPath;
  mimeType: string;
  agentTools?: string[];
  hasAgent: boolean;
  isMessageAttachment: boolean;
  /** Undefined when not looked up, as for an upload that cannot land on context. */
  contextEnabled?: boolean;
}): { toolResource?: string; rejection?: UploadRejection } {
  const {
    toolResource,
    deliveryPath,
    mimeType,
    agentTools,
    hasAgent,
    isMessageAttachment,
    contextEnabled,
  } = params;

  /* A permanent context resource is only readable while the capability is on: priming
   * skips those ids entirely when it is off, so storing one reports success and leaves
   * the agent a file it can never open. */
  const refusesContext = (resource: string): boolean =>
    resource === EToolResources.context &&
    hasAgent &&
    !isMessageAttachment &&
    contextEnabled === false;

  if (toolResource) {
    const resolved =
      toolResource === EToolResources.ocr ? EToolResources.context : (toolResource as string);
    return refusesContext(resolved)
      ? { rejection: 'context-disabled' }
      : { toolResource: resolved };
  }

  if (deliveryPath === 'text') {
    return refusesContext(EToolResources.context)
      ? { rejection: 'context-disabled' }
      : { toolResource: EToolResources.context };
  }

  /* Skills contribute file tools per turn without being stored on the agent, so this list
   * can name a consumer but its silence proves nothing. Used to file an upload, never to
   * refuse one, and matched on what each tool can actually read so the choice does not
   * depend on the order the agent happens to list its tools in. */
  const consumingTool = agentTools?.find(
    (tool) =>
      (tool === EToolResources.execute_code || tool === EToolResources.file_search) &&
      canToolResourceConsume(tool, mimeType),
  );

  if (!isMessageAttachment && deliveryPath === 'none' && consumingTool) {
    return { toolResource: consumingTool };
  }

  if (hasAgent && !isMessageAttachment) {
    return { rejection: 'no-agent-resource' };
  }

  /* With no agent behind the upload there is no tool to provision it to and no callback
   * that could, so a file kept off the model path here is unreachable by anything. This
   * is knowable, unlike an agent's tool set, which a skill can add to at execution. */
  if (!hasAgent && deliveryPath === 'none') {
    return { rejection: 'no-consumer' };
  }

  return {};
}
