import { logger } from '@librechat/data-schemas';
import { FileSources, mergeFileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { processTextWithTokenLimit } from '~/utils/text';

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
  attachments: IMongoFile[];
  req?: ServerRequest;
  tokenCountFn: (text: string) => number;
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

      resultText += `${!resultText ? 'Attached document(s):\n```md' : '\n\n---\n\n'}# "${file.filename}"\n${limitedText}\n`;
    }
  }

  if (resultText) {
    resultText += '\n```';
    return resultText;
  }

  return undefined;
}
