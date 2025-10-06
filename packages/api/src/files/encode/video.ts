import { Providers } from '@librechat/agents';
import { isDocumentSupportedProvider } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { StrategyFunctions, VideoResult } from '~/types/files';
import { validateVideo } from '~/files/validation';
import { getFileStream } from './utils';

/**
 * Encodes and formats video files for different providers
 * @param req - The request object
 * @param files - Array of video files
 * @param provider - The provider to format for
 * @param getStrategyFunctions - Function to get strategy functions
 * @returns Promise that resolves to videos and file metadata
 */
export async function encodeAndFormatVideos(
  req: Request,
  files: IMongoFile[],
  provider: Providers,
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

    if (!file.type.startsWith('video/') || !isDocumentSupportedProvider(provider)) {
      result.files.push(metadata);
      continue;
    }

    const videoBuffer = Buffer.from(content, 'base64');
    const validation = await validateVideo(videoBuffer, videoBuffer.length, provider);

    if (!validation.isValid) {
      throw new Error(`Video validation failed: ${validation.error}`);
    }

    if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
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
