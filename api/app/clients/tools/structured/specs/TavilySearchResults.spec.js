const TavilySearchResults = require('../TavilySearchResults');

jest.mock('node-fetch');
jest.mock('@langchain/core/utils/env');

describe('TavilySearchResults', () => {
  let originalEnv;
  const mockApiKey = 'mock_api_key';

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      TAVILY_API_KEY: mockApiKey,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
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
});
