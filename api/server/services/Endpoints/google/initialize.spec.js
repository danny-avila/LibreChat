// file deepcode ignore HardcodedNonCryptoSecret: No hardcoded secrets
const { getUserKey } = require('~/server/services/UserService');
const initializeClient = require('./initialize');
const { GoogleClient } = require('~/app');

jest.mock('~/server/services/UserService', () => ({
  checkUserKeyExpiry: jest.requireActual('~/server/services/UserService').checkUserKeyExpiry,
  getUserKey: jest.fn().mockImplementation(() => ({})),
}));

// Config is now passed via req.config, not getAppConfig

const app = { locals: {} };

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
      app,
      config: {
        endpoints: {
          all: {},
          google: {},
        },
      },
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
      app,
      config: {
        endpoints: {
          all: {},
          google: {},
        },
      },
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
      app,
      config: {
        endpoints: {
          all: {},
          google: {},
        },
      },
    };
    const res = {};
    const endpointOption = { modelOptions: { model: 'default-model' } };
    await expect(initializeClient({ req, res, endpointOption })).rejects.toThrow(
      /expired_user_key/,
    );
  });
});
