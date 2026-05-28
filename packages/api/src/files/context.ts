import getStream from 'get-stream';
import { logger } from '@librechat/data-schemas';
import { FileSources, mergeFileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions } from '~/types';
import { processTextWithTokenLimit } from '~/utils/text';
import type { TokenCountFn } from '~/utils/text';

/** Cache for strategy functions to avoid repeated lookups */
const strategyCache: Record<string, StrategyFunctions> = {};

/**
 * Fetches text content from cloud storage (S3, Azure, etc.) when not stored in database.
 * @param file - The file record
 * @param req - Server request for context
 * @param getStrategyFunctions - Function to get storage strategy handlers
 * @returns The text content, or undefined if fetch fails
 */
async function fetchTextFromStorage(
  file: IMongoFile,
  req: ServerRequest,
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<string | undefined> {
  const source = file.source ?? FileSources.local;

  try {
    if (!strategyCache[source]) {
      strategyCache[source] = getStrategyFunctions(source);
    }

    const { getDownloadStream } = strategyCache[source];
    if (!getDownloadStream) {
      logger.warn(`[fetchTextFromStorage] No download stream for source: ${source}`);
      return undefined;
    }

    logger.debug(`[fetchTextFromStorage] Fetching file from ${source}: ${file.filepath}`);
    const stream = await getDownloadStream(req, file.filepath);
    const buffer = await getStream.buffer(stream);
    logger.debug(`[fetchTextFromStorage] Successfully fetched file from ${source}: ${file.filename}`);
    return buffer.toString('utf8');
  } catch (err) {
    logger.error(`[fetchTextFromStorage] Failed to fetch file from ${source}: ${file.filepath}`, err);
    return undefined;
  }
}

/**
 * Extracts text context from attachments and returns formatted text.
 * This handles text that was already extracted from files (OCR, transcriptions, document text, etc.)
 * For cloud storage (S3, etc.), text is fetched on demand from the storage backend.
 * @param params - The parameters object
 * @param params.attachments - Array of file attachments
 * @param params.req - Express request object for config access
 * @param params.tokenCountFn - Function to count tokens in text
 * @param params.getStrategyFunctions - Function to get storage strategy handlers (required for cloud storage)
 * @returns The formatted file context text, or undefined if no text found
 */
export async function extractFileContext({
  attachments,
  req,
  tokenCountFn,
  getStrategyFunctions,
}: {
  attachments: IMongoFile[];
  req?: ServerRequest;
  tokenCountFn: TokenCountFn;
  getStrategyFunctions?: (source: string) => StrategyFunctions;
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

  const documentStrategy = req?.config?.fileStrategies?.document ?? req?.config?.fileStrategy;
  const cloudFetchEnabled =
    documentStrategy != null &&
    documentStrategy !== FileSources.local &&
    documentStrategy !== FileSources.text;

  let resultText = '';

  for (const file of attachments) {
    let text = file.text;

    if (
      !text &&
      file.filepath &&
      getStrategyFunctions &&
      req &&
      cloudFetchEnabled &&
      file.embedded !== true
    ) {
      text = await fetchTextFromStorage(file, req, getStrategyFunctions);
    }

    if (text) {
      const { text: limitedText, wasTruncated } = await processTextWithTokenLimit({
        text,
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
