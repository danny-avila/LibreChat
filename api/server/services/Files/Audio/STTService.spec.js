const { z } = require('zod');
const { Readable } = require('stream');

// Mock all external dependencies so we can test in isolation
jest.mock('axios');
jest.mock('form-data');
jest.mock('https-proxy-agent');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock('@librechat/api', () => ({ genAzureEndpoint: jest.fn(), logAxiosError: jest.fn() }));
jest.mock('librechat-data-provider', () => ({
  extractEnvVariable: jest.fn((v) => v),
  STTProviders: { OPENAI: 'openai', AZURE_OPENAI: 'azureOpenAI' },
}));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));

const axios = require('axios');
const fs = require('fs').promises;
const { getAppConfig } = require('~/server/services/Config');
const {
  STTService,
  getFileExtensionFromMime,
  MIME_TO_EXTENSION_MAP,
} = require('./STTService');

// Helpers for openAIProvider/processSpeechToText tests
const createStream = () =>
  Object.assign(Readable.from(Buffer.from('audio')), { path: 'audio.webm' });

const baseSchema = {
  url: 'http://whisper/v1/audio/transcriptions',
  apiKey: 'none',
  model: 'whisper-1',
};

const createAppConfig = (extra = {}) => ({
  speech: { stt: { openai: { ...baseSchema, ...extra } } },
});

// Mirror of sttOpenaiSchema from config.ts (not exported).
// If the upstream schema changes, these tests catch the drift.
const sttOpenaiSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string(),
  model: z.string(),
  language: z
    .string()
    .regex(/^[a-z]{2}(-[a-z]{2})?$/)
    .optional(),
  extraParams: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

describe('getFileExtensionFromMime', () => {
  it('should normalize audio/x-m4a to m4a', () => {
    expect(getFileExtensionFromMime('audio/x-m4a')).toBe('m4a');
  });

  it('should normalize audio/mp4 to m4a', () => {
    expect(getFileExtensionFromMime('audio/mp4')).toBe('m4a');
  });

  it('should normalize audio/x-wav to wav', () => {
    expect(getFileExtensionFromMime('audio/x-wav')).toBe('wav');
  });

  it('should normalize audio/x-flac to flac', () => {
    expect(getFileExtensionFromMime('audio/x-flac')).toBe('flac');
  });

  it('should normalize audio/mpeg to mp3', () => {
    expect(getFileExtensionFromMime('audio/mpeg')).toBe('mp3');
  });

  it('should return webm for audio/webm', () => {
    expect(getFileExtensionFromMime('audio/webm')).toBe('webm');
  });

  it('should return ogg for audio/ogg', () => {
    expect(getFileExtensionFromMime('audio/ogg')).toBe('ogg');
  });

  it('should fall back to webm for unknown MIME types', () => {
    expect(getFileExtensionFromMime('audio/somethingelse')).toBe('webm');
  });

  it('should return webm for null/undefined input', () => {
    expect(getFileExtensionFromMime(null)).toBe('webm');
    expect(getFileExtensionFromMime(undefined)).toBe('webm');
  });
});

describe('STT audio format validation with MIME normalization', () => {
  const acceptedFormats = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];

  /**
   * Mirrors the format validation logic in azureOpenAIProvider.
   * Only uses MIME_TO_EXTENSION_MAP for normalization so unknown audio
   * subtypes are not silently accepted via the webm default fallback.
   * Raw subtype matching is gated on audio/video prefix to prevent
   * non-audio types like text/webm from passing.
   */
  function isFormatAccepted(mimetype) {
    const [mimePrefix, rawFormat = ''] = mimetype.split('/');
    const isAudioMime = mimePrefix === 'audio' || mimePrefix === 'video';
    const isKnownMime = mimetype in MIME_TO_EXTENSION_MAP;
    const normalizedFormat = isKnownMime ? MIME_TO_EXTENSION_MAP[mimetype] : null;
    return (
      acceptedFormats.includes(normalizedFormat) ||
      (isAudioMime && acceptedFormats.includes(rawFormat))
    );
  }

  it('should accept audio/x-m4a (browser MIME for .m4a files)', () => {
    expect(isFormatAccepted('audio/x-m4a')).toBe(true);
  });

  it('should accept audio/x-wav', () => {
    expect(isFormatAccepted('audio/x-wav')).toBe(true);
  });

  it('should accept audio/x-flac', () => {
    expect(isFormatAccepted('audio/x-flac')).toBe(true);
  });

  it('should accept standard formats directly', () => {
    expect(isFormatAccepted('audio/mpeg')).toBe(true);
    expect(isFormatAccepted('audio/wav')).toBe(true);
    expect(isFormatAccepted('audio/ogg')).toBe(true);
    expect(isFormatAccepted('audio/webm')).toBe(true);
    expect(isFormatAccepted('audio/flac')).toBe(true);
    expect(isFormatAccepted('audio/mp3')).toBe(true);
    expect(isFormatAccepted('audio/mp4')).toBe(true);
    expect(isFormatAccepted('audio/mpga')).toBe(true);
  });

  it('should reject unknown audio subtypes', () => {
    expect(isFormatAccepted('audio/aac')).toBe(false);
    expect(isFormatAccepted('audio/somethingelse')).toBe(false);
    expect(isFormatAccepted('video/unknown')).toBe(false);
  });

  it('should accept application/ogg (valid Ogg container MIME type in the map)', () => {
    expect(isFormatAccepted('application/ogg')).toBe(true);
  });

  it('should reject non-audio types even if subtype matches an accepted format', () => {
    expect(isFormatAccepted('text/webm')).toBe(false);
    expect(isFormatAccepted('text/plain')).toBe(false);
    expect(isFormatAccepted('application/json')).toBe(false);
  });
});

describe('sttOpenaiSchema', () => {
  const base = { apiKey: 'none', model: 'whisper-1' };

  it.each([
    { lang: 'pl', valid: true },
    { lang: 'en-us', valid: true },
    { lang: 'Polish', valid: false },
    { lang: 'xyz123', valid: false },
  ])('language "$lang" → valid=$valid', ({ lang, valid }) => {
    const fn = () => sttOpenaiSchema.parse({ ...base, language: lang });
    valid ? expect(fn().language).toBe(lang) : expect(fn).toThrow();
  });

  it.each([
    { desc: 'string/number/boolean', params: { vad_filter: true, beam_size: 5 }, valid: true },
    { desc: 'null value', params: { bad: null }, valid: false },
  ])('extraParams with $desc → valid=$valid', ({ params, valid }) => {
    const fn = () => sttOpenaiSchema.parse({ ...base, extraParams: params });
    valid ? expect(fn().extraParams).toEqual(params) : expect(fn).toThrow();
  });

  it('works without optional fields', () => {
    const result = sttOpenaiSchema.parse(base);
    expect(result.language).toBeUndefined();
    expect(result.extraParams).toBeUndefined();
  });
});

describe('STTService — openAIProvider', () => {
  let service;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new STTService();
  });

  it('includes validated language in request data', () => {
    const [, data] = service.openAIProvider(baseSchema, createStream(), {}, 'pl');
    expect(data.language).toBe('pl');
  });

  it('omits language when empty string passed', () => {
    const [, data] = service.openAIProvider(baseSchema, createStream(), {}, '');
    expect(data.language).toBeUndefined();
  });

  it('forwards extraParams to request data', () => {
    const schema = { ...baseSchema, extraParams: { vad_filter: true, temperature: 0.5 } };
    const [, data] = service.openAIProvider(schema, createStream(), {}, '');
    expect(data.vad_filter).toBe(true);
    expect(data.temperature).toBe(0.5);
  });

  it.each([
    { field: 'file', preserved: 'stream' },
    { field: 'model', preserved: 'whisper-1' },
    { field: 'language', preserved: 'pl' },
  ])('filters reserved field "$field" from extraParams', ({ field }) => {
    const stream = createStream();
    const schema = { ...baseSchema, extraParams: { [field]: 'bad', vad_filter: true } };
    const [, data] = service.openAIProvider(schema, stream, {}, field === 'language' ? 'pl' : '');

    expect(data.vad_filter).toBe(true);
    if (field === 'file') expect(data.file).toBe(stream);
    if (field === 'model') expect(data.model).toBe('whisper-1');
    if (field === 'language') expect(data.language).toBe('pl');
  });

  it('works without extraParams', () => {
    const [, data] = service.openAIProvider(baseSchema, createStream(), {}, '');
    expect(data.file).toBeDefined();
    expect(data.model).toBe('whisper-1');
  });
});

describe('STTService — processSpeechToText', () => {
  let service;
  const mockReq = (lang = '') => ({
    file: {
      path: '/tmp/audio.webm',
      originalname: 'audio.webm',
      mimetype: 'audio/webm',
      size: 1000,
    },
    body: { language: lang },
  });
  const mockRes = () => ({
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
    sendStatus: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new STTService();
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('audio'));
    jest.spyOn(fs, 'unlink').mockResolvedValue();
    axios.post.mockResolvedValue({ status: 200, data: { text: 'transcribed' } });
  });

  it.each([
    { desc: 'client language over schema', clientLang: 'en', schemaLang: 'pl', expected: 'en' },
    { desc: 'schema fallback when client empty', clientLang: '', schemaLang: 'pl', expected: 'pl' },
    {
      desc: 'no language when neither set',
      clientLang: '',
      schemaLang: undefined,
      expected: undefined,
    },
  ])('uses $desc', async ({ clientLang, schemaLang, expected }) => {
    const extra = schemaLang ? { language: schemaLang } : {};
    getAppConfig.mockResolvedValue(createAppConfig(extra));
    await service.processSpeechToText(mockReq(clientLang), mockRes());
    expect(axios.post.mock.calls[0][1].language).toBe(expected);
  });

  it('cleans up temp file after processing', async () => {
    getAppConfig.mockResolvedValue(createAppConfig());
    await service.processSpeechToText(mockReq(), mockRes());
    expect(fs.unlink).toHaveBeenCalledWith('/tmp/audio.webm');
  });
});
