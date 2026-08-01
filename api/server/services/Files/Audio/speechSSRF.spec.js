jest.mock('axios');
jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));
jest.mock('./streamAudio', () => ({
  getRandomVoiceId: jest.fn(),
  createChunkProcessor: jest.fn(),
  splitTextIntoChunks: jest.fn(),
}));

const http = require('node:http');
const axios = require('axios');
const { STTService } = require('./STTService');
const { textToSpeech } = require('./TTSService');

const httpAgentPrototype = http.Agent.prototype;

function spyLookupResult(host) {
  return new Promise((resolve) => {
    jest.spyOn(httpAgentPrototype, 'createConnection').mockImplementation((options) => {
      options.lookup(host, {}, (err, address) => resolve({ err, address }));
      return {};
    });
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  axios.post.mockReset();
});

describe('STT sttRequest SSRF guard (real agent)', () => {
  const audioFile = { originalname: 'a.wav', mimetype: 'audio/wav', size: 1 };
  const audioBuffer = Buffer.from('audio');
  const provider = { url: 'http://10.0.0.5:8080', apiKey: 'sk', model: 'whisper-1' };

  it('sets maxRedirects 0, attaches agents, and blocks a private target via the real lookup', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { text: 'ok' } });
    const service = new STTService();
    const lookupResult = spyLookupResult('10.0.0.5');

    await service.sttRequest('openai', provider, { audioBuffer, audioFile, language: '' });

    const options = axios.post.mock.calls[0][2];
    expect(options.maxRedirects).toBe(0);
    expect(options.httpAgent).toBeDefined();
    expect(options.httpsAgent).toBeDefined();

    options.httpAgent.createConnection({ host: '10.0.0.5', port: 8080 });
    const { err } = await lookupResult;
    expect(err).toBeTruthy();
    expect(err.code).toBe('ESSRF');
  });

  it('exempts a host:port in the section allowedAddresses via the real lookup', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { text: 'ok' } });
    const service = new STTService();
    const lookupResult = spyLookupResult('10.0.0.5');

    await service.sttRequest('openai', provider, { audioBuffer, audioFile, language: '' }, [
      '10.0.0.5:8080',
    ]);

    const options = axios.post.mock.calls[0][2];
    options.httpAgent.createConnection({ host: '10.0.0.5', port: 8080 });
    const { err, address } = await lookupResult;
    expect(err).toBeNull();
    expect(address).toBe('10.0.0.5');
  });
});

describe('TTS textToSpeech SSRF guard (real agent)', () => {
  function buildReqRes(allowedAddresses) {
    const req = {
      body: { input: 'hi', voice: 'v1' },
      user: { id: 'u1' },
      config: {
        speech: {
          tts: {
            ...(allowedAddresses ? { allowedAddresses } : {}),
            localai: { url: 'http://10.0.0.5:8080', apiKey: 'sk', voices: ['v1'] },
          },
        },
      },
    };
    const res = {
      setHeader: jest.fn(),
      headersSent: false,
      status: jest.fn(() => ({ end: jest.fn(), send: jest.fn() })),
      end: jest.fn(),
    };
    return { req, res };
  }

  it('threads the section allowedAddresses so the private target is blocked via the real lookup', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { pipe: jest.fn(), on: jest.fn() } });
    const { req, res } = buildReqRes();
    const lookupResult = spyLookupResult('10.0.0.5');

    await textToSpeech(req, res);

    const options = axios.post.mock.calls[0][2];
    expect(options.maxRedirects).toBe(0);
    expect(options.httpAgent).toBeDefined();
    expect(options.httpsAgent).toBeDefined();

    options.httpAgent.createConnection({ host: '10.0.0.5', port: 8080 });
    const { err } = await lookupResult;
    expect(err).toBeTruthy();
    expect(err.code).toBe('ESSRF');
  });

  it('exempts a host:port present in the section allowedAddresses via the real lookup', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { pipe: jest.fn(), on: jest.fn() } });
    const { req, res } = buildReqRes(['10.0.0.5:8080']);
    const lookupResult = spyLookupResult('10.0.0.5');

    await textToSpeech(req, res);

    const options = axios.post.mock.calls[0][2];
    options.httpAgent.createConnection({ host: '10.0.0.5', port: 8080 });
    const { err, address } = await lookupResult;
    expect(err).toBeNull();
    expect(address).toBe('10.0.0.5');
  });
});
