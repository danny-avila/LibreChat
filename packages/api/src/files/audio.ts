import fs from 'fs';
import { logger } from '@librechat/data-schemas';
import type { STTService, AudioFileInfo, FileObject, AudioProcessingResult } from '~/types';

/**
 * Processes audio files using Speech-to-Text (STT) service.
 * @param {Object} params - The parameters object.
 * @param {FileObject} params.file - The audio file object.
 * @param {STTService} params.sttService - The STT service instance.
 * @returns {Promise<AudioProcessingResult>} A promise that resolves to an object containing text and bytes.
 */
export async function processAudioFile({
  file,
  sttService,
}: {
  file: FileObject;
  sttService: STTService;
}): Promise<AudioProcessingResult> {
  try {
    const audioBuffer = await fs.promises.readFile(file.path);
    const audioFile: AudioFileInfo = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };

    const [provider, sttSchema] = await sttService.getProviderSchema();
    const text = await sttService.sttRequest(provider, sttSchema, { audioBuffer, audioFile });

    return {
      text,
      bytes: Buffer.byteLength(text, 'utf8'),
    };
  } catch (error) {
    logger.error('Error processing audio file with STT:', error);
    throw new Error(`Failed to process audio file: ${(error as Error).message}`);
  }
}
