// const OpenAI = require('openai');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ErrorTypes } = require('librechat-data-provider');
const { getUserKey, getUserKeyExpiry, getUserKeyValues } = require('~/server/services/UserService');
const initializeClient = require('./initialize');
// const { OpenAIClient } = require('~/app');

jest.mock('~/server/services/UserService', () => ({
  getUserKey: jest.fn(),
  getUserKeyExpiry: jest.fn(),
  getUserKeyValues: jest.fn(),
  checkUserKeyExpiry: jest.requireActual('~/server/services/UserService').checkUserKeyExpiry,
}));

const today = new Date();
const tenDaysFromToday = new Date(today.setDate(today.getDate() + 10));
const isoString = tenDaysFromToday.toISOString();

describe('initializeClient', () => {
  // Set up environment variables
  const originalEnvironment = process.env;
  const app = {
    locals: {},
  };

  beforeEach(() => {
    jest.resetModules(); // Clears the cache
    process.env = { ...originalEnvironment }; // Make a copy
  });

  afterAll(() => {
    process.env = originalEnvironment; // Restore original env vars
  });

  test('initializes OpenAI client with default API key and URL', async () => {
    process.env.AZURE_ASSISTANTS_API_KEY = 'default-api-key';
    process.env.AZURE_ASSISTANTS_BASE_URL = 'https://default.api.url';

    // Assuming 'isUserProvided' to return false for this test case
    jest.mock('~/server/utils', () => ({
      isUserProvided: jest.fn().mockReturnValueOnce(false),
    }));

    const req = { user: { id: 'user123' }, app };
    const res = {};

    const { openai, openAIApiKey } = await initializeClient({ req, res });
    expect(openai.apiKey).toBe('default-api-key');
    expect(openAIApiKey).toBe('default-api-key');
    expect(openai.baseURL).toBe('https://default.api.url');
  });

  test('initializes OpenAI client with user-provided API key and URL', async () => {
    process.env.AZURE_ASSISTANTS_API_KEY = 'user_provided';
    process.env.AZURE_ASSISTANTS_BASE_URL = 'user_provided';

    getUserKeyValues.mockResolvedValue({ apiKey: 'user-api-key', baseURL: 'https://user.api.url' });
    getUserKeyExpiry.mockResolvedValue(isoString);

    const req = { user: { id: 'user123' }, app };
    const res = {};

    const { openai, openAIApiKey } = await initializeClient({ req, res });
    expect(openAIApiKey).toBe('user-api-key');
    expect(openai.apiKey).toBe('user-api-key');
    expect(openai.baseURL).toBe('https://user.api.url');
  });

  test('throws error for invalid JSON in user-provided values', async () => {
    process.env.AZURE_ASSISTANTS_API_KEY = 'user_provided';
    getUserKey.mockResolvedValue('invalid-json');
    getUserKeyExpiry.mockResolvedValue(isoString);
    getUserKeyValues.mockImplementation(() => {
      let userValues = getUserKey();
      try {
        userValues = JSON.parse(userValues);
      } catch (e) {
        throw new Error(
          JSON.stringify({
            type: ErrorTypes.INVALID_USER_KEY,
          }),
        );
      }
      return userValues;
    });

    const req = { user: { id: 'user123' } };
    const res = {};

    await expect(initializeClient({ req, res })).rejects.toThrow(/invalid_user_key/);
  });

  test('throws error if API key is not provided', async () => {
    delete process.env.AZURE_ASSISTANTS_API_KEY; // Simulate missing API key

    const req = { user: { id: 'user123' }, app };
    const res = {};

    await expect(initializeClient({ req, res })).rejects.toThrow(/Assistants API key not/);
  });

  test('initializes OpenAI client with proxy configuration', async () => {
    process.env.AZURE_ASSISTANTS_API_KEY = 'test-key';
    process.env.PROXY = 'http://proxy.server';

    const req = { user: { id: 'user123' }, app };
    const res = {};

    const { openai } = await initializeClient({ req, res });
    expect(openai.httpAgent).toBeInstanceOf(HttpsProxyAgent);
  });
});
