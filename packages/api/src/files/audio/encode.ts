import { Readable } from 'stream';
import getStream from 'get-stream';
import { EModelEndpoint, isDocumentSupportedEndpoint } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { Request } from 'express';
import { validateAudio } from '~/files/validation';

interface StrategyFunctions {
  getDownloadStream: (req: Request, filepath: string) => Promise<Readable>;
}

interface AudioResult {
  audios: Array<{
    type: string;
    mimeType: string;
    data: string;
  }>;
  files: Array<{
    file_id?: string;
    temp_file_id?: string;
    filepath: string;
    source?: string;
    filename: string;
    type: string;
  }>;
}

/**
 * Encodes and formats audio files for different endpoints
 * @param req - The request object
 * @param files - Array of audio files
 * @param endpoint - The endpoint to format for (currently only google is supported)
 * @returns Promise that resolves to audio and file metadata
 */
export async function encodeAndFormatAudios(
  req: Request,
  files: IMongoFile[],
  endpoint: EModelEndpoint,
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<AudioResult> {
  if (!files?.length) {
    return { audios: [], files: [] };
  }

  const encodingMethods: Record<string, StrategyFunctions> = {};
  const result: AudioResult = { audios: [], files: [] };

  const processFile = async (file: IMongoFile) => {
    if (!file?.filepath) return null;

    const source = file.source ?? 'local';
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
  };

  const results = await Promise.allSettled(files.map(processFile));

  for (const settledResult of results) {
    if (settledResult.status === 'rejected') {
      console.error('Audio processing failed:', settledResult.reason);
      continue;
    }

    const processed = settledResult.value;
    if (!processed) continue;

    const { file, content, metadata } = processed;

    if (!content || !file) {
      if (metadata) result.files.push(metadata);
      continue;
    }

    if (!file.type.startsWith('audio/') || !isDocumentSupportedEndpoint(endpoint)) {
      result.files.push(metadata);
      continue;
    }

    const audioBuffer = Buffer.from(content, 'base64');
    const validation = await validateAudio(audioBuffer, audioBuffer.length, endpoint);

    if (!validation.isValid) {
      throw new Error(`Audio validation failed: ${validation.error}`);
    }

    if (endpoint === EModelEndpoint.google) {
      result.audios.push({
        type: 'audio',
        mimeType: file.type,
        data: content,
      });
    }

    result.files.push(metadata);
  }

  return result;
}
