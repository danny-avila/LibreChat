import { logger } from '@librechat/data-schemas';
import { FileSources, FileContext, mergeFileConfig } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
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

type FileContextAttachment = Pick<TFile, 'text' | 'filename'> & {
  source?: string;
  llmDeliveryPath?: string;
  context?: string;
  filepath?: string;
};

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
 * Builds the "Files were uploaded to the following URLs" note for attachments
 * uploaded through the "Upload and Share as URL" menu entry. The link is the
 * only thing the model ever receives for such a file, and the file is stored
 * permanently, so this is independent of `fileTokenLimit`.
 */
function extractPublicUrlContext(attachments: readonly FileContextAttachment[]): string {
  const domain = process.env.DOMAIN_SERVER || 'http://localhost:3080';
  const urls = attachments
    .filter((file) => file.context === FileContext.public_url && file.filepath)
    .map((file) => `${domain}${file.filepath}`);

  if (urls.length === 0) {
    return '';
  }

  return `Files were uploaded to the following URLs: ${urls.join(' ')}`;
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
  attachments: readonly FileContextAttachment[];
  req?: ServerRequest;
  tokenCountFn: TokenCountFn;
}): Promise<string | undefined> {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  const urlContext = extractPublicUrlContext(attachments);

  const fileConfig = mergeFileConfig(req?.config?.fileConfig);
  const fileTokenLimit = req?.body?.fileTokenLimit ?? fileConfig.fileTokenLimit;

  if (!fileTokenLimit) {
    // If no token limit, no text is processed; public share links still apply
    return urlContext || undefined;
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
  }

  const combined = [urlContext, resultText].filter(Boolean).join('\n\n');
  return combined || undefined;
}
