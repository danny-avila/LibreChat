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

  it('should not throw when KEENABLE_API_KEY is missing (keyless by default)', () => {
    delete process.env.KEENABLE_API_KEY;
    expect(() => new KeenableSearch()).not.toThrow();
  });

  it('should target the public endpoint when no key is set', () => {
    delete process.env.KEENABLE_API_KEY;
    const instance = new KeenableSearch();
    expect(instance.apiKey).toBeUndefined();
    expect(instance.apiUrl).toBe('https://api.keenable.ai/v1/search/public');
  });

  it('should use the provided KEENABLE_API_KEY field when the env var is unset', () => {
    delete process.env.KEENABLE_API_KEY;
    const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
    expect(instance.apiKey).toBe(mockApiKey);
  });

  it('should default to the authenticated endpoint when a key is present', () => {
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

    it('should POST the query with X-API-Key and attribution headers when keyed', async () => {
      const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
      await instance._call({ query: 'test query', max_results: 3 });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.keenable.ai/v1/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': mockApiKey,
            'X-Keenable-Title': 'LibreChat',
          }),
          body: JSON.stringify({ query: 'test query' }),
        }),
      );
    });

    it('should POST to the public endpoint with attribution and no X-API-Key when keyless', async () => {
      delete process.env.KEENABLE_API_KEY;
      const instance = new KeenableSearch();
      await instance._call({ query: 'test query' });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.keenable.ai/v1/search/public',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Keenable-Title': 'LibreChat',
          }),
          body: JSON.stringify({ query: 'test query' }),
        }),
      );
      const [, options] = fetch.mock.calls[0];
      expect(options.headers['X-API-Key']).toBeUndefined();
    });

    it('should not send max_results in the request body (unsupported by the API)', async () => {
      const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
      await instance._call({ query: 'test query', max_results: 5 });

      const [, options] = fetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ query: 'test query' });
    });

    it('should limit results to max_results client-side', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          query: 'q',
          results: [{ url: '1' }, { url: '2' }, { url: '3' }],
        }),
      });
      const instance = new KeenableSearch({ KEENABLE_API_KEY: mockApiKey });
      const out = await instance._call({ query: 'q', max_results: 2 });
      expect(JSON.parse(out).results).toHaveLength(2);
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
