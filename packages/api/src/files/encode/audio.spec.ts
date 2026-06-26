import { Providers } from '@librechat/agents';
import { EModelEndpoint } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { encodeAndFormatAudios } from './audio';

jest.mock('~/files/validation', () => ({
  validateAudio: jest.fn(),
}));

jest.mock('./utils', () => ({
  getFileStream: jest.fn(),
  getConfiguredFileSizeLimit: jest.fn(),
}));

import { validateAudio } from '~/files/validation';
import { getFileStream, getConfiguredFileSizeLimit } from './utils';
import { Types } from 'mongoose';

const mockedValidateAudio = validateAudio as jest.MockedFunction<typeof validateAudio>;
const mockedGetFileStream = getFileStream as jest.MockedFunction<typeof getFileStream>;
const mockedGetConfiguredFileSizeLimit = getConfiguredFileSizeLimit as jest.MockedFunction<
  typeof getConfiguredFileSizeLimit
>;

describe('encodeAndFormatAudios - provider formatting', () => {
  const mockStrategyFunctions = jest.fn();
  const content = Buffer.from('fake-audio-bytes').toString('base64');

  const createMockAudioFile = (filename = 'voice.mp3', type = 'audio/mp3'): IMongoFile =>
    ({
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(),
      file_id: new Types.ObjectId().toString(),
      filename,
      type,
      bytes: 2048,
      object: 'file',
      usage: 0,
      source: 'test',
      filepath: `/test/${filename}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as unknown as IMongoFile;

  const encodeFor = (provider: Providers) => {
    const file = createMockAudioFile();
    mockedGetFileStream.mockResolvedValue({ file, content, metadata: file });
    return encodeAndFormatAudios({} as ServerRequest, [file], { provider }, mockStrategyFunctions);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetConfiguredFileSizeLimit.mockReturnValue(undefined);
    mockedValidateAudio.mockResolvedValue({ isValid: true });
  });

  it.each([
    Providers.OPENAI,
    Providers.OPENROUTER,
    Providers.MISTRALAI,
    Providers.DEEPSEEK,
    Providers.XAI,
    Providers.MOONSHOT,
  ])('sends input_audio to OpenAI-compatible provider %s', async (provider) => {
    const result = await encodeFor(provider);
    expect(result.audios).toHaveLength(1);
    expect(result.audios[0]).toEqual({
      type: 'input_audio',
      input_audio: { data: content, format: 'mp3' },
    });
  });

  it('sends input_audio to an OpenAI-compatible custom endpoint', async () => {
    const result = await encodeFor(EModelEndpoint.custom as unknown as Providers);
    expect(result.audios).toHaveLength(1);
    expect(result.audios[0]).toMatchObject({
      type: 'input_audio',
      input_audio: { format: 'mp3' },
    });
  });

  it.each([Providers.GOOGLE, Providers.VERTEXAI])('sends a media block to %s', async (provider) => {
    const result = await encodeFor(provider);
    expect(result.audios).toHaveLength(1);
    expect(result.audios[0]).toEqual({ type: 'media', mimeType: 'audio/mp3', data: content });
  });

  it('does not send audio to a document-supported provider that has no audio input (anthropic)', async () => {
    const result = await encodeFor(Providers.ANTHROPIC);
    expect(result.audios).toHaveLength(0);
    expect(result.files).toHaveLength(1);
  });
});
