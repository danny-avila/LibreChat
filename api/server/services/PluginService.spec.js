const mockLoggerError = jest.fn();
const mockFindOnePluginAuth = jest.fn();
const mockUpdatePluginAuth = jest.fn();
const mockEncryptCredential = jest.fn();
const mockDecryptCredential = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: mockLoggerError },
}));

jest.mock('@librechat/api', () => ({
  encryptCredential: (...args) => mockEncryptCredential(...args),
  decryptCredential: (...args) => mockDecryptCredential(...args),
}));

jest.mock('~/models', () => ({
  findOnePluginAuth: (...args) => mockFindOnePluginAuth(...args),
  updatePluginAuth: (...args) => mockUpdatePluginAuth(...args),
  deletePluginAuth: jest.fn(),
}));

const { getUserPluginAuthValue, updateUserPluginAuth } = require('./PluginService');

describe('getUserPluginAuthValue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not log an expected missing auth value', async () => {
    mockFindOnePluginAuth.mockResolvedValue(null);

    await expect(
      getUserPluginAuthValue('user-id', 'WEB_SEARCH_SELECTED_PROVIDER'),
    ).rejects.toMatchObject({ code: 'PLUGIN_AUTH_NOT_FOUND' });

    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('still logs credential-store failures', async () => {
    const error = new Error('database unavailable');
    mockFindOnePluginAuth.mockRejectedValue(error);

    await expect(getUserPluginAuthValue('user-id', 'WEB_SEARCH_SELECTED_PROVIDER')).rejects.toBe(
      error,
    );

    expect(mockLoggerError).toHaveBeenCalledWith('[getUserPluginAuthValue]', error);
  });
});

describe('plugin auth encryption routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('decrypts stored values through the version-aware helper', async () => {
    mockFindOnePluginAuth.mockResolvedValue({ value: 'v3:abc:def' });
    mockDecryptCredential.mockResolvedValue('plain');

    await expect(getUserPluginAuthValue('user-id', 'API_KEY')).resolves.toBe('plain');
    expect(mockDecryptCredential).toHaveBeenCalledWith('v3:abc:def');
  });

  it('stores values encrypted by the credential helper', async () => {
    mockEncryptCredential.mockReturnValue('v3:iv:cipher');
    mockUpdatePluginAuth.mockResolvedValue({ value: 'v3:iv:cipher' });

    await updateUserPluginAuth('user-id', 'API_KEY', 'plugin', 'plain');

    expect(mockEncryptCredential).toHaveBeenCalledWith('plain');
    expect(mockUpdatePluginAuth).toHaveBeenCalledWith({
      userId: 'user-id',
      authField: 'API_KEY',
      pluginKey: 'plugin',
      value: 'v3:iv:cipher',
    });
  });
});
