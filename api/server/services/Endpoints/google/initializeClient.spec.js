const initializeClient = require('./initializeClient');
const { GoogleClient } = require('~/app');
const { checkUserKeyExpiry, getUserKey } = require('../../UserService');

jest.mock('../../UserService', () => ({
  checkUserKeyExpiry: jest.fn().mockImplementation((expiresAt, errorMessage) => {
    if (new Date(expiresAt) < new Date()) {
      throw new Error(errorMessage);
    }
  }),
  getUserKey: jest.fn().mockImplementation(() => ({})),
}));

describe('google/initializeClient', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize GoogleClient with user-provided credentials', async () => {
    process.env.GOOGLE_KEY = 'user_provided';
    process.env.GOOGLE_REVERSE_PROXY = 'http://reverse.proxy';
    process.env.PROXY = 'http://proxy';

    const expiresAt = new Date(Date.now() + 60000).toISOString();

    const req = {
      body: { key: expiresAt },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    const { client, credentials } = await initializeClient({ req, res, endpointOption });

    expect(getUserKey).toHaveBeenCalledWith({ userId: '123', name: 'google' });
    expect(client).toBeInstanceOf(GoogleClient);
    expect(client.options.reverseProxyUrl).toBe('http://reverse.proxy');
    expect(client.options.proxy).toBe('http://proxy');
    expect(credentials).toEqual({});
  });

  test('should initialize GoogleClient with service key credentials', async () => {
    process.env.GOOGLE_KEY = 'service_key';
    process.env.GOOGLE_REVERSE_PROXY = 'http://reverse.proxy';
    process.env.PROXY = 'http://proxy';

    const req = {
      body: { key: null },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    const { client, credentials } = await initializeClient({ req, res, endpointOption });

    expect(client).toBeInstanceOf(GoogleClient);
    expect(client.options.reverseProxyUrl).toBe('http://reverse.proxy');
    expect(client.options.proxy).toBe('http://proxy');
    expect(credentials).toEqual({
      GOOGLE_SERVICE_KEY: {},
      GOOGLE_API_KEY: 'service_key',
    });
  });

  test('should handle expired user-provided key', async () => {
    process.env.GOOGLE_KEY = 'user_provided';

    const expiresAt = new Date(Date.now() - 10000).toISOString(); // Expired
    const req = {
      body: { key: expiresAt },
      user: { id: '123' },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };

    checkUserKeyExpiry.mockImplementation((expiresAt, errorMessage) => {
      throw new Error(errorMessage);
    });

    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /Your Google Credentials have expired/,
    );
  });
});
