const { fetch, ProxyAgent } = require('undici');
const TavilySearchResults = require('../TavilySearchResults');

jest.mock('undici');
jest.mock('@langchain/core/utils/env');

describe('TavilySearchResults', () => {
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
      TAVILY_API_KEY: mockApiKey,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw an error if TAVILY_API_KEY is missing', () => {
    delete process.env.TAVILY_API_KEY;
    expect(() => new TavilySearchResults()).toThrow('Missing TAVILY_API_KEY environment variable.');
  });

  it('should use mockApiKey when TAVILY_API_KEY is not set in the environment', () => {
    const instance = new TavilySearchResults({
      TAVILY_API_KEY: mockApiKey,
    });
    expect(instance.apiKey).toBe(mockApiKey);
  });

  describe('proxy support', () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ results: [] }),
    };

    beforeEach(() => {
      fetch.mockResolvedValue(mockResponse);
    });

    it('should use ProxyAgent when PROXY env var is set', async () => {
      const proxyUrl = 'http://proxy.example.com:8080';
      process.env.PROXY = proxyUrl;

      const mockProxyAgent = { type: 'proxy-agent' };
      ProxyAgent.mockImplementation(() => mockProxyAgent);

      const instance = new TavilySearchResults({ TAVILY_API_KEY: mockApiKey });
      await instance._call({ query: 'test query' });

      expect(ProxyAgent).toHaveBeenCalledWith(proxyUrl);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          dispatcher: mockProxyAgent,
        }),
      );
    });

    it('should not use ProxyAgent when PROXY env var is not set', async () => {
      delete process.env.PROXY;

      const instance = new TavilySearchResults({ TAVILY_API_KEY: mockApiKey });
      await instance._call({ query: 'test query' });

      expect(ProxyAgent).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.not.objectContaining({
          dispatcher: expect.anything(),
        }),
      );
    });
  });
});
