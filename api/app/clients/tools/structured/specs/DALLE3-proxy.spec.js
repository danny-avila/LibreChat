const DALLE3 = require('../DALLE3');
const { ProxyAgent } = require('undici');

jest.mock('tiktoken');
const processFileURL = jest.fn();

describe('DALLE3 Proxy Configuration', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should configure ProxyAgent in fetchOptions.dispatcher when PROXY env is set', () => {
    // Set proxy environment variable
    process.env.PROXY = 'http://proxy.example.com:8080';
    process.env.DALLE_API_KEY = 'test-api-key';

    // Create instance
    const dalleWithProxy = new DALLE3({ processFileURL });

    // Check that the openai client exists
    expect(dalleWithProxy.openai).toBeDefined();

    // Check that _options exists and has fetchOptions with a dispatcher
    expect(dalleWithProxy.openai._options).toBeDefined();
    expect(dalleWithProxy.openai._options.fetchOptions).toBeDefined();
    expect(dalleWithProxy.openai._options.fetchOptions.dispatcher).toBeDefined();
    expect(dalleWithProxy.openai._options.fetchOptions.dispatcher).toBeInstanceOf(ProxyAgent);
  });

  it('should not configure ProxyAgent when PROXY env is not set', () => {
    // Ensure PROXY is not set
    delete process.env.PROXY;
    process.env.DALLE_API_KEY = 'test-api-key';

    // Create instance
    const dalleWithoutProxy = new DALLE3({ processFileURL });

    // Check that the openai client exists
    expect(dalleWithoutProxy.openai).toBeDefined();

    // Check that _options exists but fetchOptions either doesn't exist or doesn't have a dispatcher
    expect(dalleWithoutProxy.openai._options).toBeDefined();

    // fetchOptions should either not exist or not have a dispatcher
    if (dalleWithoutProxy.openai._options.fetchOptions) {
      expect(dalleWithoutProxy.openai._options.fetchOptions.dispatcher).toBeUndefined();
    }
  });
});
