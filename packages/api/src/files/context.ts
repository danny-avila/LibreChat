import { logger } from '@librechat/data-schemas';
import { mergeFileConfig } from 'librechat-data-provider';
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
    if (!file.text) {
      continue;
    }

    const { text: limitedText, wasTruncated } = await processTextWithTokenLimit({
      text: file.text,
      tokenLimit: fileTokenLimit,
      tokenCountFn,
    });

    if (!limitedText) {
      continue;
    }

    if (wasTruncated) {
      logger.debug(
        `[extractFileContext] Text content truncated for file: ${file.filename} due to token limits`,
      );
    }

    resultText += `${!resultText ? 'Attached document(s):\n```md' : '\n\n---\n\n'}# "${file.filename}"\n${limitedText}\n`;
  }
  // Validate: if we have document files but no extracted text, parsing failed
  const documentFiles = attachments.filter(
    f => f.type === 'application/pdf' || f.type?.startsWith('application/')
  );
  if (documentFiles.length > 0 && !resultText) {
    const filenames = documentFiles.map(f => f.filename).join(', ');
    logger.error(
      `[extractFileContext] Document parsing failed - no text extracted from: ${filenames}`,
    );
    throw new Error(
      `Failed to extract text from document(s): ${filenames}. The document could not be parsed. Please try re-uploading the file or use a different format.`,
    );
  }
  if (resultText) {
    resultText += '\n```';
    return resultText;
  }

  return undefined;
}
