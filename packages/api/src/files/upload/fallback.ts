import { logger } from '@librechat/data-schemas';
import { isNativelyReadableText, documentParserMimeTypes } from 'librechat-data-provider';
import type {
  FiltersConfig,
  EndpointFileConfig,
  TDefaultLLMDeliveryPath,
} from 'librechat-data-provider';
import {
  extractInspectableFileText,
  getFileExtractionLogDetails,
  MAX_STORED_EXTRACTED_TEXT_BYTES,
} from '~/files/extract';
import { extractFileContent } from '~/protection/adapters/submissions';
import { hasActiveFileFieldPolicy } from '~/protection/files';
import { inspectContent } from '~/protection/runtime';

export const UPLOAD_FALLBACK_TEXT_PLANS = {
  documentParser: 'document_parser',
  nativeText: 'native_text',
} as const;

export type UploadFallbackTextPlan =
  (typeof UPLOAD_FALLBACK_TEXT_PLANS)[keyof typeof UPLOAD_FALLBACK_TEXT_PLANS];

export interface UploadFallbackTextRoute {
  /** The route the upload resolved to. */
  deliveryPath: TDefaultLLMDeliveryPath;
  /** The tool resource the request named, if any. */
  toolResource?: string | null;
  /** Whether the upload attaches to a message; an agent's own tool files never reach a prompt. */
  isMessageAttachment: boolean;
  mimeType: string;
  /** The upload endpoint's file config, which opts in through `textFallbackWithoutTools`. */
  endpointConfig?: Pick<EndpointFileConfig, 'textFallbackWithoutTools'>;
}

type FallbackTextExtractor = () => Promise<{ readonly text?: string | null } | null | undefined>;

/**
 * Which built-in extractor stores text for an upload left to tools, or `null` when none runs.
 *
 * Where the endpoint enables `textFallbackWithoutTools`, a turn that runs no tool able to read a
 * `none`-routed file delivers this text instead (`resolveTurnLLMDeliveryPath`). Only an inferred
 * route on a message attachment qualifies: naming a tool resource is the user keeping the file
 * off the model, and files kept on an agent's tool resources never reach a prompt. A file filed
 * under a tool that reads it still gets text, because a later turn may run without that tool: a
 * handoff agent, or the same agent after its tools or grants change. Only built-in extractors
 * run, so a file meant for a tool never costs a RAG or OCR call.
 */
export function getUploadFallbackTextPlan(
  route: UploadFallbackTextRoute,
): UploadFallbackTextPlan | null {
  if (
    route.endpointConfig?.textFallbackWithoutTools !== true ||
    route.deliveryPath !== 'none' ||
    route.toolResource != null ||
    !route.isMessageAttachment
  ) {
    return null;
  }
  if (documentParserMimeTypes.some((pattern) => pattern.test(route.mimeType))) {
    return UPLOAD_FALLBACK_TEXT_PLANS.documentParser;
  }
  return isNativelyReadableText(route.mimeType) ? UPLOAD_FALLBACK_TEXT_PLANS.nativeText : null;
}

/**
 * Text a turn without a reading tool can fall back to for this upload, when one applies.
 *
 * Best effort by design: an extractor failure, text a policy cannot inspect, an overrun of the
 * storage cap, or a content finding leaves the upload without fallback text rather than
 * refusing a file whose primary reader is a tool. Text that is delivered later is inspected
 * again as model-bound content.
 */
export async function resolveUploadFallbackText({
  filters,
  filename,
  fileId,
  extractDocument,
  readNativeText,
  ...route
}: UploadFallbackTextRoute & {
  filters?: FiltersConfig;
  filename: string;
  fileId: string;
  extractDocument: FallbackTextExtractor;
  readNativeText: FallbackTextExtractor;
}): Promise<string | undefined> {
  const plan = getUploadFallbackTextPlan(route);
  if (plan == null) {
    return undefined;
  }
  const skip = (reason: string, error?: unknown): undefined => {
    const { fileLabel, errorMetadata } = getFileExtractionLogDetails({
      filters,
      filename,
      fileId,
      error,
    });
    logger.warn(
      `[resolveUploadFallbackText] No fallback text for ${fileLabel}: ${reason}`,
      errorMetadata,
    );
    return undefined;
  };
  try {
    const result = await extractInspectableFileText({
      filters,
      extract:
        plan === UPLOAD_FALLBACK_TEXT_PLANS.documentParser ? extractDocument : readNativeText,
    });
    const text = result?.text;
    if (typeof text !== 'string' || text.trim().length === 0) {
      return undefined;
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_STORED_EXTRACTED_TEXT_BYTES) {
      return skip('extracted text exceeds the storage limit');
    }
    if (
      filters != null &&
      hasActiveFileFieldPolicy(filters, ['extracted_text']) &&
      inspectContent(extractFileContent({ extractedText: text }), { filters }) != null
    ) {
      return skip('extracted text matched a content policy');
    }
    return text;
  } catch (error) {
    return skip('extraction failed', error);
  }
}
