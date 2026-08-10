import fs from 'fs';
import type { STTService, ServerRequest, FileObject } from '../types';
import { processAudioFile } from './audio';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, promises: { ...actual.promises, readFile: jest.fn() } };
});

describe('processAudioFile', () => {
  it('threads the section-level allowedAddresses from getProviderSchema into sttRequest', async () => {
    (fs.promises.readFile as jest.Mock).mockResolvedValue(Buffer.from('audio'));
    const sttRequest = jest.fn().mockResolvedValue('transcribed');
    const schema = { url: 'http://stt.internal:8020' };
    const sttService: STTService = {
      getInstance: jest.fn(),
      getProviderSchema: jest.fn().mockResolvedValue(['openai', schema, ['stt.internal:8020']]),
      sttRequest,
    };
    const file: FileObject = {
      path: '/tmp/a.wav',
      originalname: 'a.wav',
      mimetype: 'audio/wav',
      size: 5,
    };

    const result = await processAudioFile({ req: {} as ServerRequest, file, sttService });

    expect(result.text).toBe('transcribed');
    expect(sttRequest).toHaveBeenCalledWith('openai', schema, expect.any(Object), [
      'stt.internal:8020',
    ]);
  });
});
