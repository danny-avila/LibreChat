const GoogleSearch = require('../GoogleSearch');

jest.mock('node-fetch');
jest.mock('@langchain/core/utils/env');

describe('GoogleSearch', () => {
  let originalEnv;
  const mockApiKey = 'mock_api';
  const mockSearchEngineId = 'mock_search_engine_id';

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      GOOGLE_SEARCH_API_KEY: mockApiKey,
      GOOGLE_CSE_ID: mockSearchEngineId,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  it('should use mockApiKey and mockSearchEngineId when environment variables are not set', () => {
    const instance = new GoogleSearch({
      GOOGLE_SEARCH_API_KEY: mockApiKey,
      GOOGLE_CSE_ID: mockSearchEngineId,
    });
    expect(instance.apiKey).toBe(mockApiKey);
    expect(instance.searchEngineId).toBe(mockSearchEngineId);
  });

  it('should throw an error if GOOGLE_SEARCH_API_KEY or GOOGLE_CSE_ID is missing', () => {
    delete process.env.GOOGLE_SEARCH_API_KEY;
    expect(() => new GoogleSearch()).toThrow(
      'Missing GOOGLE_SEARCH_API_KEY or GOOGLE_CSE_ID environment variable.',
    );

    process.env.GOOGLE_SEARCH_API_KEY = mockApiKey;
    delete process.env.GOOGLE_CSE_ID;
    expect(() => new GoogleSearch()).toThrow(
      'Missing GOOGLE_SEARCH_API_KEY or GOOGLE_CSE_ID environment variable.',
    );
  });
});
