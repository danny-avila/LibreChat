import { Providers } from '@librechat/agents';
import { isDocumentSupportedProvider, isOpenAILikeProvider } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions, AudioResult } from '~/types';
import { getFileStream, getConfiguredFileSizeLimit } from './utils';
import { validateAudio } from '~/files/validation';

/**
 * Encodes and formats audio files for different providers
 * @param req - The request object
 * @param files - Array of audio files
 * @param params - Object containing provider and optional endpoint
 * @param params.provider - The provider to format for (Google/Vertex use media blocks; OpenAI-compatible providers use input_audio)
 * @param params.endpoint - Optional endpoint name for file config lookup
 * @param getStrategyFunctions - Function to get strategy functions
 * @returns Promise that resolves to audio and file metadata
 */
export async function encodeAndFormatAudios(
  req: ServerRequest,
  files: IMongoFile[],
  params: { provider: Providers; endpoint?: string },
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<AudioResult> {
  const { provider, endpoint } = params;
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

    /** Extract configured file size limit from fileConfig for this endpoint */
    const configuredFileSizeLimit = getConfiguredFileSizeLimit(req, {
      provider,
      endpoint,
    });

    const validation = await validateAudio(
      audioBuffer,
      audioBuffer.length,
      provider,
      configuredFileSizeLimit,
    );

    if (!validation.isValid) {
      throw new Error(`Audio validation failed: ${validation.error}`);
    }

    if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
      result.audios.push({
        type: 'media',
        mimeType: file.type,
        data: content,
      });
    } else if (isOpenAILikeProvider(provider)) {
      // input_audio is the OpenAI-standard audio content part, so it applies to every
      // OpenAI-compatible provider (OpenAI, Azure, custom endpoints, OpenRouter, etc.).
      // Format is taken from the filename extension (e.g. 'audio.mp3' -> 'mp3'); MIME types
      // don't always match (e.g. 'audio/mpeg' is mp3, not mpeg), so the extension is more reliable.
      const format = file.filename.split('.').pop()?.toLowerCase();
      if (!format) {
        throw new Error(`Could not extract audio format from filename: ${file.filename}`);
      }
      result.audios.push({
        type: 'input_audio',
        input_audio: {
          data: content,
          format,
        },
      });
    }

    result.files.push(metadata);
  }

  return result;
}
