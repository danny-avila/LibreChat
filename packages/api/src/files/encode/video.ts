import { EModelEndpoint, isDocumentSupportedEndpoint } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { StrategyFunctions, VideoResult } from '~/types/files';
import { getFileStream } from './utils';
import { validateVideo } from '~/files/validation';

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

  const results = await Promise.allSettled(
    files.map((file) => getFileStream(req, file, encodingMethods, getStrategyFunctions)),
  );

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
