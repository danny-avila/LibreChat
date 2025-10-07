import { Providers } from '@librechat/agents';
import { isDocumentSupportedProvider } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { StrategyFunctions, AudioResult } from '~/types/files';
import { validateAudio } from '~/files/validation';
import { getFileStream } from './utils';

/**
 * Encodes and formats audio files for different providers
 * @param req - The request object
 * @param files - Array of audio files
 * @param provider - The provider to format for (currently only google is supported)
 * @param getStrategyFunctions - Function to get strategy functions
 * @returns Promise that resolves to audio and file metadata
 */
export async function encodeAndFormatAudios(
  req: Request,
  files: IMongoFile[],
  provider: Providers,
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<AudioResult> {
  if (!files?.length) {
    return { audios: [], files: [] };
  }

  const encodingMethods: Record<string, StrategyFunctions> = {};
  const result: AudioResult = { audios: [], files: [] };

  const results = await Promise.allSettled(
    files.map((file) => getFileStream(req, file, encodingMethods, getStrategyFunctions)),
  );

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

    if (!file.type.startsWith('audio/') || !isDocumentSupportedProvider(provider)) {
      result.files.push(metadata);
      continue;
    }

    const audioBuffer = Buffer.from(content, 'base64');
    const validation = await validateAudio(audioBuffer, audioBuffer.length, provider);

    if (!validation.isValid) {
      throw new Error(`Audio validation failed: ${validation.error}`);
    }

    if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
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
