const { fetch, ProxyAgent } = require('undici');
const KeenableSearch = require('../KeenableSearch');

jest.mock('undici');

describe('KeenableSearch', () => {
  let originalEnv;
  const mockApiKey = 'mock_api_key';

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      KEENABLE_API_KEY: mockApiKey,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw an error if KEENABLE_API_KEY is missing', () => {
    delete process.env.KEENABLE_API_KEY;
    expect(() => new KeenableSearch()).toThrow('Missing KEENABLE_API_KEY environment variable.');
  });

  it('should use provided KEENABLE_API_KEY field when env var is unset', () => {
    delete process.env.KEENABLE_API_KEY;
    const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
    expect(instance.apiKey).toBe(mockApiKey);
  });

  it('should default to https://api.keenable.ai/v1/search when KEENABLE_API_URL is unset', () => {
    const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
    expect(instance.apiUrl).toBe('https://api.keenable.ai/v1/search');
  });

  it('should honor KEENABLE_API_URL override', () => {
    process.env.KEENABLE_API_URL = 'https://staging.keenable.ai/search';
    const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
    expect(instance.apiUrl).toBe('https://staging.keenable.ai/search');
  });

  describe('_call', () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ results: [] }),
    };

    beforeEach(() => {
      fetch.mockResolvedValue(mockResponse);
    });

    it('should send a POST with X-API-Key auth and the query body', async () => {
      const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
      await instance._call({ query: 'test query', max_results: 3 });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.keenable.ai/v1/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': mockApiKey,
          }),
          body: JSON.stringify({ query: 'test query', max_results: 3 }),
        }),
      );
    });

    it('should default max_results to 10 when not provided', async () => {
      const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
      await instance._call({ query: 'test query' });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.keenable.ai/v1/search',
        expect.objectContaining({
          body: JSON.stringify({ query: 'test query', max_results: 10 }),
        }),
      );
    });

    it('should use ProxyAgent when PROXY env var is set', async () => {
      const proxyUrl = 'http://proxy.example.com:8080';
      process.env.PROXY = proxyUrl;

      const mockProxyAgent = { type: 'proxy-agent' };
      ProxyAgent.mockImplementation(() => mockProxyAgent);

      const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
      await instance._call({ query: 'test query' });

      expect(ProxyAgent).toHaveBeenCalledWith(proxyUrl);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.keenable.ai/v1/search',
        expect.objectContaining({ dispatcher: mockProxyAgent }),
      );
    });

    it('should not use ProxyAgent when PROXY env var is not set', async () => {
      delete process.env.PROXY;

      const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
      await instance._call({ query: 'test query' });

      expect(ProxyAgent).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.keenable.ai/v1/search',
        expect.not.objectContaining({ dispatcher: expect.anything() }),
      );
    });

    it('should throw on non-2xx response', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ error: 'invalid key' }),
      });

      const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
      await expect(instance._call({ query: 'test' })).rejects.toThrow(
        'Request failed with status 401: invalid key',
      );
    });
  });
});
