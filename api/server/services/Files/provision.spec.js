/**
 * Regression guard for lazy code-env provisioning auth.
 *
 * `loadCodeApiKey` previously read `EnvVar.CODE_API_KEY`, which `@librechat/agents`
 * no longer exports — so it resolved to `undefined`, `loadAuthValues` threw on
 * `undefined.split('||')`, and lazy code-env provisioning silently bailed. These
 * tests pin the field name and the graceful (non-throwing) contract.
 */

jest.mock('@librechat/agents', () => ({
  getCodeBaseURL: jest.fn(() => 'http://code.test/v1'),
}));

jest.mock('@librechat/api', () => {
  const axiosInstance = jest.fn();
  return {
    logAxiosError: jest.fn(),
    createAxiosInstance: jest.fn(() => axiosInstance),
    codeServerHttpAgent: {},
    codeServerHttpsAgent: {},
    getCodeApiAuthHeaders: jest.fn().mockResolvedValue({}),
    __codeAxios: axiosInstance,
  };
});

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('./strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getCodeApiAuthHeaders, __codeAxios } = require('@librechat/api');
const { loadCodeApiKey, checkSessionsAlive } = require('./provision');

describe('loadCodeApiKey', () => {
  afterEach(() => jest.clearAllMocks());

  it('loads LIBRECHAT_CODE_API_KEY via loadAuthValues without throwing on absence', async () => {
    loadAuthValues.mockResolvedValue({ LIBRECHAT_CODE_API_KEY: 'secret-key' });

    await expect(loadCodeApiKey('user-1')).resolves.toBe('secret-key');
    expect(loadAuthValues).toHaveBeenCalledWith({
      userId: 'user-1',
      authFields: ['LIBRECHAT_CODE_API_KEY'],
      throwError: false,
    });
  });

  it('returns undefined when no code key is configured', async () => {
    loadAuthValues.mockResolvedValue({});

    await expect(loadCodeApiKey('user-1')).resolves.toBeUndefined();
  });
});

describe('checkSessionsAlive', () => {
  afterEach(() => jest.clearAllMocks());

  const staleFile = (id) => ({
    file_id: id,
    filename: `${id}.csv`,
    metadata: {
      codeEnvRef: {
        kind: 'user',
        id: 'u1',
        storage_session_id: 'sess-1',
        file_id: `remote-${id}`,
        provisionedAt: 1,
      },
    },
  });

  it('authenticates the live check with JWT bearer headers when no legacy key is set', async () => {
    getCodeApiAuthHeaders.mockResolvedValue({ Authorization: 'Bearer jwt-token' });
    __codeAxios.mockResolvedValue({ data: [{ fileId: 'remote-f1' }] });

    const alive = await checkSessionsAlive({
      files: [staleFile('f1')],
      req: { user: { id: 'u1' } },
    });

    expect(getCodeApiAuthHeaders).toHaveBeenCalledWith({ user: { id: 'u1' } });
    const headers = __codeAxios.mock.calls[0][0].headers;
    expect(headers.Authorization).toBe('Bearer jwt-token');
    expect(headers['X-API-Key']).toBeUndefined();
    expect(alive.has('f1')).toBe(true);
  });

  it('sends the legacy X-API-Key alongside bearer minting when configured', async () => {
    getCodeApiAuthHeaders.mockResolvedValue({});
    __codeAxios.mockResolvedValue({ data: [] });

    await checkSessionsAlive({ files: [staleFile('f2')], apiKey: 'legacy-key' });

    expect(__codeAxios.mock.calls[0][0].headers['X-API-Key']).toBe('legacy-key');
  });
});
