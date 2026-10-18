import { logger } from '@librechat/data-schemas';
import {
  FileSources,
  hasTurnFileConsumer,
  mergeFileConfig,
  resolveSandboxFilename,
} from 'librechat-data-provider';
import type { TFile, TurnDeliveryFile, TurnFileConsumers } from 'librechat-data-provider';
import type { TokenCountFn } from '~/utils/text';
import type { ServerRequest } from '~/types';
import { processTextWithTokenLimit } from '~/utils/text';

/**
 * Stand-in text for a user turn that carries attachments but no typed message.
 * Anthropic and the Assistants API both reject empty user content, and files
 * that reach the model out-of-band (RAG, code environment) leave nothing else
 * in the turn, so the payload needs this minimal note. The stored message keeps
 * its empty text so the UI still renders the attachment on its own.
 */
export const ATTACHMENT_ONLY_TEXT = 'Please refer to the attached file(s).';

/**
 * Title-generation input for a turn the user sent without typing anything.
 * Immediate title timing runs before any response exists, so the attachment
 * filenames are the only conversation-specific signal available; without them
 * the title model is prompted with an empty string and invents a topic.
 */
export function getAttachmentTitleText(files?: TFile[] | null): string {
  if (!files?.length) {
    return '';
  }

  const filenames = files.map((file) => file.filename).filter(Boolean);
  return filenames.length > 0 ? `Attached file(s): ${filenames.join(', ')}` : '';
}

/**
 * Extracts text context from attachments and returns formatted text.
 * This handles text that was already extracted from files (OCR, transcriptions, document text, etc.)
 * @param params - The parameters object
 * @param params.attachments - Array of file attachments
 * @param params.req - Express request object for config access
 * @param params.tokenCountFn - Function to count tokens in text
 * @returns The formatted file context text, or undefined if no text found
 */
export async function extractFileContext({
  attachments,
  req,
  tokenCountFn,
}: {
  attachments: readonly (Pick<TFile, 'text' | 'filename'> & {
    source?: string;
    llmDeliveryPath?: string;
  })[];
  req?: ServerRequest;
  tokenCountFn: TokenCountFn;
}): Promise<string | undefined> {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  const fileConfig = mergeFileConfig(req?.config?.fileConfig);
  const fileTokenLimit = req?.body?.fileTokenLimit ?? fileConfig.fileTokenLimit;

  if (!fileTokenLimit) {
    // If no token limit, return undefined (no processing)
    return undefined;
  }

  let resultText = '';

  for (const file of attachments) {
    const source = file.source ?? FileSources.local;
    if (file.llmDeliveryPath === 'none') {
      continue;
    }

    const hasTextDelivery = file.llmDeliveryPath === 'text' || source === FileSources.text;
    if (hasTextDelivery && file.text) {
      const { text: limitedText, wasTruncated } = await processTextWithTokenLimit({
        text: file.text,
        tokenLimit: fileTokenLimit,
        tokenCountFn,
      });

      if (wasTruncated) {
        logger.debug(
          `[extractFileContext] Text content truncated for file: ${file.filename} due to token limits`,
        );
      }

      resultText += `${!resultText ? 'Attached document(s):\n```md' : '\n\n---\n\n'}# "${file.filename}"\n${limitedText}\n`;
    }
  }

  if (resultText) {
    resultText += '\n```';
    return resultText;
  }

  return undefined;
}

/** The attachment fields the manifest reads; satisfied by every hydrated record. */
type ManifestAttachment = Pick<TFile, 'filename' | 'type' | 'bytes'> & TurnDeliveryFile;

/** Human-readable size for one manifest line; uploads always carry bytes, records may not. */
function formatAttachmentSize(bytes?: number | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return 'unknown size';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${parseFloat(size.toFixed(1))} ${units[unit]}`;
}

/**
 * Manifest for attachments the caller has resolved to out-of-band delivery on this turn:
 * they reach a tool's own store (code environment sandbox, file search vectors) instead of
 * the prompt, so without this they leave no trace in the turn and the model cannot know
 * they exist. One line per file the turn's tools can actually read names the file and
 * where to read it, so a turn that only says "analyze this" stays actionable.
 *
 * Reachability reuses {@link hasTurnFileConsumer}: run code claims a file its first call
 * would upload, file search only one the record shows a store holding. Files nothing can
 * read produce no line rather than a promise the tools cannot keep. The code environment
 * path follows {@link resolveSandboxFilename}, the same rule provisioning derives the
 * mount name from, so the advertised path is the one the first upload mounts at.
 */
export function buildAttachmentManifest({
  attachments,
  fileConsumers,
}: {
  attachments: readonly ManifestAttachment[];
  fileConsumers?: TurnFileConsumers | null;
}): string | undefined {
  if (!attachments?.length || !fileConsumers) {
    return undefined;
  }

  const lines: string[] = [];
  for (const file of attachments) {
    const mimeType = file.type ?? '';
    if (!mimeType || !file.filename) {
      continue;
    }
    if (fileConsumers.executeCode && hasTurnFileConsumer(mimeType, fileConsumers)) {
      const sandboxName = resolveSandboxFilename(file.filename, mimeType);
      lines.push(
        `- \`${file.filename}\` (${mimeType}, ${formatAttachmentSize(file.bytes)}) — ` +
          `in the code environment at \`/mnt/data/${sandboxName}\``,
      );
    } else if (fileConsumers.fileSearch && hasTurnFileConsumer(mimeType, fileConsumers, file)) {
      lines.push(
        `- \`${file.filename}\` (${mimeType}, ${formatAttachmentSize(file.bytes)}) — ` +
          'available to the file_search tool',
      );
    }
  }

  if (!lines.length) {
    return undefined;
  }
  return `Attached file(s) delivered out-of-band to this turn's tools:\n${lines.join('\n')}`;
}
