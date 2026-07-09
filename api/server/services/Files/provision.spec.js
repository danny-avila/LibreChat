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

jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(),
  createAxiosInstance: jest.fn(() => jest.fn()),
  codeServerHttpAgent: {},
  codeServerHttpsAgent: {},
}));

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
const { loadCodeApiKey } = require('./provision');

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
