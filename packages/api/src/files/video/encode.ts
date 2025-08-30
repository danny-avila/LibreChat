import { EModelEndpoint, isDocumentSupportedEndpoint } from 'librechat-data-provider';
import { validateVideo } from '@librechat/api';
import getStream from 'get-stream';
import type { Request } from 'express';
import type { IMongoFile } from '@librechat/data-schemas';
import { Readable } from 'stream';

interface StrategyFunctions {
  getDownloadStream: (req: Request, filepath: string) => Promise<Readable>;
}

interface VideoResult {
  videos: Array<{
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
 * Encodes and formats video files for different endpoints
 * @param req - The request object
 * @param files - Array of video files
 * @param endpoint - The endpoint to format for
 * @param getStrategyFunctions - Function to get strategy functions
 * @returns Promise that resolves to videos and file metadata
 */
export async function encodeAndFormatVideos(
  req: Request,
  files: IMongoFile[],
  endpoint: EModelEndpoint,
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<VideoResult> {
  if (!files?.length) {
    return { videos: [], files: [] };
  }

  const encodingMethods: Record<string, StrategyFunctions> = {};
  const result: VideoResult = { videos: [], files: [] };

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
      console.error('Video processing failed:', settledResult.reason);
      continue;
    }

    const processed = settledResult.value;
    if (!processed) continue;

    const { file, content, metadata } = processed;

    if (!content || !file) {
      if (metadata) result.files.push(metadata);
      continue;
    }

    if (!file.type.startsWith('video/') || !isDocumentSupportedEndpoint(endpoint)) {
      result.files.push(metadata);
      continue;
    }

    const videoBuffer = Buffer.from(content, 'base64');
    const validation = await validateVideo(videoBuffer, videoBuffer.length, endpoint);

    if (!validation.isValid) {
      throw new Error(`Video validation failed: ${validation.error}`);
    }

    if (endpoint === EModelEndpoint.google) {
      result.videos.push({
        type: 'video',
        mimeType: file.type,
        data: content,
      });
    }

    result.files.push(metadata);
  }

  return result;
}
