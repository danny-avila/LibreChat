import getStream from 'get-stream';
import { FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { StrategyFunctions, ProcessedFile } from '~/types/files';

/**
 * Processes a file by downloading and encoding it to base64
 * @param req - Express request object
 * @param file - File object to process
 * @param encodingMethods - Cache of encoding methods by source
 * @param getStrategyFunctions - Function to get strategy functions for a source
 * @returns Processed file with content and metadata, or null if filepath missing
 */
export async function getFileStream(
  req: Request,
  file: IMongoFile,
  encodingMethods: Record<string, StrategyFunctions>,
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<ProcessedFile | null> {
  if (!file?.filepath) {
    return null;
  }

  const source = file.source ?? FileSources.local;
  if (!encodingMethods[source]) {
    encodingMethods[source] = getStrategyFunctions(source);
  }

  const { getDownloadStream } = encodingMethods[source];
  const stream = await getDownloadStream(req, file.filepath);
  const buffer = await getStream.buffer(stream);

  return {
    file,
    content: buffer.toString('base64'),
    metadata: {
      file_id: file.file_id,
      temp_file_id: file.temp_file_id,
      filepath: file.filepath,
      source: file.source,
      filename: file.filename,
      type: file.type,
    },
  };
}
