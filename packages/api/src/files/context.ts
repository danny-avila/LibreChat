import { logger } from '@librechat/data-schemas';
import { FileSources, mergeFileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { processTextWithTokenLimit } from '~/utils/text';
import type { FileContextConfig } from 'librechat-data-provider';

/**
 * Extracts text context from attachments and returns formatted text.
 * This handles text that was already extracted from files (OCR, transcriptions, document text, etc.)
 * @param params - The parameters object
 * @param params.attachments - Array of file attachments
 * @param params.req - Express request object for config access
 * @param params.tokenCountFn - Function to count tokens in text
 * @param params.contextConfig - Optional file context configuration (see FileContextConfig; e.g. prefixText, showFilenameHeaders, filenameHeaderTemplate, latestAttachmentsAsSystemMessage)
 * @returns The formatted file context text, or undefined if no text found
 */
export async function extractFileContext({
  attachments,
  req,
  tokenCountFn,
  contextConfig,
}: {
  attachments: IMongoFile[];
  req?: ServerRequest;
  tokenCountFn: (text: string) => number;
  contextConfig?: FileContextConfig;
}): Promise<string | undefined> {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  const fileConfig = mergeFileConfig(req?.config?.fileConfig);
  const fileTokenLimit = req?.body?.fileTokenLimit ?? fileConfig.fileTokenLimit;
  const fileContextConfig = contextConfig ?? fileConfig.fileContext;
  const prefixText = fileContextConfig?.prefixText ?? 'Attached document(s):';
  const showFilenameHeaders = fileContextConfig?.showFilenameHeaders ?? true;
  const filenameHeaderTemplate =
    fileContextConfig?.filenameHeaderTemplate ?? '# "{filename}"';

  if (!fileTokenLimit) {
    // If no token limit, return undefined (no processing)
    return undefined;
  }

  let resultText = '';

  for (const file of attachments) {
    const source = file.source ?? FileSources.local;
    if (source === FileSources.text && file.text) {
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

      const filenameHeader = showFilenameHeaders
        ? filenameHeaderTemplate.replace(/\{filename\}/g, file.filename)
        : '';
      const prefixBlock = !resultText ? `${prefixText}\n\`\`\`md` : '\n---\n\n';
      const headerBlock = showFilenameHeaders ? `${filenameHeader}\n` : '';
      resultText += `${prefixBlock}\n${headerBlock}${limitedText}\n`;
    }
  }

  if (resultText) {
    resultText += '\n```';
    return resultText;
  }

  return undefined;
}
