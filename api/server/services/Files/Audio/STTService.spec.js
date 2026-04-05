const { z } = require('zod');
const { Readable } = require('stream');
const { STTService } = require('./STTService');

jest.mock('axios');
// Required: real import pulls in sharp via dependency chain, which isn't available in test env
jest.mock('@librechat/api', () => ({ genAzureEndpoint: jest.fn(), logAxiosError: jest.fn() }));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));

const axios = require('axios');
const fs = require('fs').promises;
const { getAppConfig } = require('~/server/services/Config');

// Helpers
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
