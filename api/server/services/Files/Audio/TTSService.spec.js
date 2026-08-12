jest.mock('axios');
jest.mock('@librechat/data-schemas', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@librechat/api', () => ({
  genAzureEndpoint: jest.fn(),
  logAxiosError: jest.fn(),
  applyAxiosProxyConfig: jest.fn(),
  applySSRFSafeAgentIfDirect: jest.fn(),
  resolveConfigSecret: jest.fn(),
}));
jest.mock('librechat-data-provider', () => ({
  extractEnvVariable: jest.fn((value) => value),
  TTSProviders: {
    OPENAI: 'openai',
    AZURE_OPENAI: 'azureOpenAI',
    ELEVENLABS: 'elevenlabs',
    LOCALAI: 'localai',
    MINIMAX: 'minimax',
  },
}));
jest.mock('./streamAudio', () => ({
  getRandomVoiceId: jest.fn(),
  createChunkProcessor: jest.fn(),
  splitTextIntoChunks: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));

const axios = require('axios');
const { resolveConfigSecret } = require('@librechat/api');
const { TTSService, getProvider } = require('./TTSService');

describe('TTSService provider header construction with an undecryptable apiKey', () => {
  let service;

  beforeEach(() => {
    service = new TTSService();
    resolveConfigSecret.mockReset();
  });

  it('omits the Authorization header for openAIProvider instead of sending "Bearer undefined"', () => {
    resolveConfigSecret.mockReturnValue(undefined);
    const [, , headers] = service.openAIProvider(
      { apiKey: 'v3:corrupted', voices: [] },
      'hi',
      'alloy',
    );
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('sets the Authorization header normally when the key resolves', () => {
    resolveConfigSecret.mockReturnValue('sk-real-key');
    const [, , headers] = service.openAIProvider({ apiKey: 'v3:ok', voices: [] }, 'hi', 'alloy');
    expect(headers.Authorization).toBe('Bearer sk-real-key');
  });

  it('omits the xi-api-key header for elevenLabsProvider instead of sending "undefined"', () => {
    resolveConfigSecret.mockReturnValue(undefined);
    const [, , headers] = service.elevenLabsProvider(
      { apiKey: 'v3:corrupted', voices: ['ALL'] },
      'hi',
      'voice1',
      false,
    );
    expect(headers).not.toHaveProperty('xi-api-key');
  });

  it('omits the Authorization header for localAIProvider instead of sending "Bearer undefined"', () => {
    resolveConfigSecret.mockReturnValue(undefined);
    const [, , headers] = service.localAIProvider(
      { apiKey: 'v3:corrupted', voices: [] },
      'hi',
      'voice1',
    );
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('omits the Authorization header for miniMaxProvider instead of sending "Bearer undefined"', () => {
    resolveConfigSecret.mockReturnValue(undefined);
    const [, , headers] = service.miniMaxProvider(
      { apiKey: 'v3:corrupted', voices: [] },
      'hi',
      'English_expressive_narrator',
    );
    expect(headers).not.toHaveProperty('Authorization');
  });
});

describe('TTSService MiniMax integration', () => {
  let service;

  beforeEach(() => {
    service = new TTSService();
    axios.post.mockReset();
    resolveConfigSecret.mockReset();
    resolveConfigSecret.mockReturnValue('resolved-key');
  });

  it.each([
    ['global_en', 'https://api.minimax.io/v1/t2a_v2'],
    ['cn_zh', 'https://api.minimaxi.com/v1/t2a_v2'],
  ])('maps %s configuration to its regional endpoint', (region, expectedUrl) => {
    const [url, data, headers] = service.miniMaxProvider(
      {
        apiKey: 'configured-key',
        region,
        model: 'speech-2.8-hd',
        voices: ['English_expressive_narrator'],
        language_boost: 'English',
        voice_settings: { speed: 1.1 },
        audio_settings: { format: 'mp3', sample_rate: 32000 },
      },
      'Hello',
      'English_expressive_narrator',
    );

    expect(url).toBe(expectedUrl);
    expect(data).toEqual({
      model: 'speech-2.8-hd',
      text: 'Hello',
      stream: false,
      output_format: 'hex',
      language_boost: 'English',
      voice_setting: { voice_id: 'English_expressive_narrator', speed: 1.1 },
      audio_setting: { format: 'mp3', sample_rate: 32000 },
    });
    expect(headers.Authorization).toBe('Bearer resolved-key');
  });

  it('decodes response audio from hex into a readable stream', async () => {
    axios.post.mockResolvedValue({
      data: { data: { audio: '494433' }, base_resp: { status_code: 0 } },
    });

    const response = await service.ttsRequest(
      'minimax',
      {
        apiKey: 'configured-key',
        region: 'global_en',
        model: 'speech-2.8-hd',
        voices: ['English_expressive_narrator'],
      },
      { input: 'Hello', voice: 'English_expressive_narrator' },
    );
    const chunks = [];
    for await (const chunk of response.data) {
      chunks.push(chunk);
    }

    expect(Buffer.concat(chunks)).toEqual(Buffer.from('ID3'));
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.minimax.io/v1/t2a_v2',
      expect.objectContaining({ model: 'speech-2.8-hd', text: 'Hello' }),
      expect.objectContaining({ responseType: 'json' }),
    );
  });

  it('rejects unsuccessful API responses', () => {
    expect(() =>
      service.parseMiniMaxResponse({
        data: { data: { audio: '' }, base_resp: { status_code: 1004 } },
      }),
    ).toThrow('MiniMax TTS request failed with status code 1004');
  });
});

describe('TTSService getProvider detection', () => {
  const buildConfig = (tts) => ({ speech: { tts } });

  it('resolves exactly one provider when allowedAddresses is set alongside it', async () => {
    const provider = await getProvider(
      buildConfig({
        allowedAddresses: ['localhost:11434'],
        localai: { url: 'http://localhost:11434/tts', apiKey: 'sk' },
      }),
    );
    expect(provider).toBe('localai');
  });

  it('reports "No provider is set" when only allowedAddresses is present', async () => {
    await expect(
      getProvider(buildConfig({ allowedAddresses: ['localhost:11434'] })),
    ).rejects.toThrow('No provider is set');
  });

  it('reports "Multiple providers" when two providers are set even with allowedAddresses', async () => {
    await expect(
      getProvider(
        buildConfig({
          allowedAddresses: ['localhost:11434'],
          openai: { url: 'http://localhost:11434', apiKey: 'sk' },
          localai: { url: 'http://localhost:11434/tts', apiKey: 'sk' },
        }),
      ),
    ).rejects.toThrow('Multiple providers are set');
  });
});
