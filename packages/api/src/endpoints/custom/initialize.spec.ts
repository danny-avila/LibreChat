import { AuthType, ErrorTypes } from 'librechat-data-provider';
import type { BaseInitializeParams } from '~/types';

const mockValidateEndpointURL = jest.fn();
jest.mock('~/auth', () => ({
  validateEndpointURL: (...args: unknown[]) => mockValidateEndpointURL(...args),
}));

const mockGetOpenAIConfig = jest.fn().mockReturnValue({
  llmConfig: { model: 'test-model' },
  configOptions: {},
});
jest.mock('~/endpoints/openai/config', () => ({
  getOpenAIConfig: (...args: unknown[]) => mockGetOpenAIConfig(...args),
}));

jest.mock('~/endpoints/models', () => ({
  fetchModels: jest.fn(),
}));

jest.mock('~/cache', () => ({
  standardCache: jest.fn(() => ({ get: jest.fn().mockResolvedValue(null) })),
  tokenConfigCache: jest.fn(() => ({ get: jest.fn().mockResolvedValue(null) })),
}));

jest.mock('~/utils', () => ({
  isUserProvided: (val: string) => val === 'user_provided',
  checkUserKeyExpiry: jest.fn(),
}));

const mockGetCustomEndpointConfig = jest.fn();
jest.mock('~/app/config', () => ({
  getCustomEndpointConfig: (...args: unknown[]) => mockGetCustomEndpointConfig(...args),
}));

import { initializeCustom } from './initialize';

function createParams(overrides: {
  apiKey?: string;
  baseURL?: string;
  userBaseURL?: string;
  userApiKey?: string;
  expiresAt?: string;
}): BaseInitializeParams {
  const { apiKey = 'sk-test-key', baseURL = 'https://api.example.com/v1' } = overrides;

  mockGetCustomEndpointConfig.mockReturnValue({
    apiKey,
    baseURL,
    models: {},
  });

  const db = {
    getUserKeyValues: jest.fn().mockResolvedValue({
      apiKey: overrides.userApiKey ?? 'sk-user-key',
      baseURL: overrides.userBaseURL ?? 'https://user-api.example.com/v1',
    }),
  } as unknown as BaseInitializeParams['db'];

  return {
    req: {
      user: { id: 'user-1' },
      body: { key: overrides.expiresAt ?? '2099-01-01' },
      config: {},
    } as unknown as BaseInitializeParams['req'],
    endpoint: 'test-custom',
    model_parameters: { model: 'gpt-4' },
    db,
  };
}

describe('initializeCustom – Agents API user key resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch user key even when expiresAt is not in request body (Agents API flow)', async () => {
    const { checkUserKeyExpiry } = jest.requireMock('~/utils');
    const params = createParams({
      apiKey: AuthType.USER_PROVIDED,
      baseURL: 'https://api.example.com/v1',
      userApiKey: 'sk-user-key',
    });
    // Simulate Agents API request body (no `key` field)
    params.req.body = { model: 'agent_123' };

    await initializeCustom(params);

    expect(params.db.getUserKeyValues).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'test-custom',
    });
    expect(checkUserKeyExpiry).not.toHaveBeenCalled();
    expect(mockGetOpenAIConfig).toHaveBeenCalledWith(
      'sk-user-key',
      expect.any(Object),
      'test-custom',
    );
  });

  it('should fetch user key for user-provided URL without expiresAt (Agents API flow)', async () => {
    const { checkUserKeyExpiry } = jest.requireMock('~/utils');
    const params = createParams({
      apiKey: 'sk-system-key',
      baseURL: AuthType.USER_PROVIDED,
      userBaseURL: 'https://user-api.example.com/v1',
    });
    params.req.body = { model: 'agent_123' };

    await initializeCustom(params);

    expect(params.db.getUserKeyValues).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'test-custom',
    });
    expect(checkUserKeyExpiry).not.toHaveBeenCalled();
  });

  it('should still check key expiry when expiresAt is provided (UI flow)', async () => {
    const { checkUserKeyExpiry } = jest.requireMock('~/utils');
    const params = createParams({
      apiKey: AuthType.USER_PROVIDED,
      baseURL: 'https://api.example.com/v1',
      userApiKey: 'sk-user-key',
      expiresAt: '2099-01-01',
    });

    await initializeCustom(params);

    expect(checkUserKeyExpiry).toHaveBeenCalledWith('2099-01-01', 'test-custom');
    expect(params.db.getUserKeyValues).toHaveBeenCalled();
  });

  it('should throw EXPIRED_USER_KEY when expiresAt is expired', async () => {
    const { checkUserKeyExpiry } = jest.requireMock('~/utils');
    checkUserKeyExpiry.mockImplementationOnce(() => {
      throw new Error(JSON.stringify({ type: ErrorTypes.EXPIRED_USER_KEY }));
    });

    const params = createParams({
      apiKey: AuthType.USER_PROVIDED,
      baseURL: 'https://api.example.com/v1',
      userApiKey: 'sk-user-key',
      expiresAt: '2020-01-01',
    });

    await expect(initializeCustom(params)).rejects.toThrow(ErrorTypes.EXPIRED_USER_KEY);
    expect(params.db.getUserKeyValues).not.toHaveBeenCalled();
  });

  it('should NOT call getUserKeyValues when key and URL are system-defined', async () => {
    const params = createParams({
      apiKey: 'sk-system-key',
      baseURL: 'https://api.provider.com/v1',
    });

    await initializeCustom(params);

    expect(params.db.getUserKeyValues).not.toHaveBeenCalled();
  });
});

describe('initializeCustom – SSRF guard wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call validateEndpointURL when baseURL is user_provided', async () => {
    const params = createParams({
      apiKey: 'sk-test-key',
      baseURL: AuthType.USER_PROVIDED,
      userBaseURL: 'https://user-api.example.com/v1',
      expiresAt: '2099-01-01',
    });

    await initializeCustom(params);

    expect(mockValidateEndpointURL).toHaveBeenCalledTimes(1);
    expect(mockValidateEndpointURL).toHaveBeenCalledWith(
      'https://user-api.example.com/v1',
      'test-custom',
      undefined,
    );
  });

  it('should NOT call validateEndpointURL when baseURL is system-defined', async () => {
    const params = createParams({
      apiKey: 'sk-test-key',
      baseURL: 'https://api.provider.com/v1',
    });

    await initializeCustom(params);

    expect(mockValidateEndpointURL).not.toHaveBeenCalled();
  });

  it('should propagate SSRF rejection from validateEndpointURL', async () => {
    mockValidateEndpointURL.mockRejectedValueOnce(
      new Error('Base URL for test-custom targets a restricted address.'),
    );

    const params = createParams({
      apiKey: 'sk-test-key',
      baseURL: AuthType.USER_PROVIDED,
      userBaseURL: 'http://169.254.169.254/latest/meta-data/',
      expiresAt: '2099-01-01',
    });

    await expect(initializeCustom(params)).rejects.toThrow('targets a restricted address');
    expect(mockGetOpenAIConfig).not.toHaveBeenCalled();
  });
});

describe('initializeCustom – token-config fetch header forwarding', () => {
  const { fetchModels } = jest.requireMock('~/endpoints/models');

  function createTokenConfigParams(overrides: {
    apiKey?: string;
    baseURL?: string;
    userBaseURL?: string;
    headers?: Record<string, string>;
  }): BaseInitializeParams {
    const { apiKey = 'sk-test-key', baseURL = 'https://openrouter.ai/api/v1' } = overrides;

    mockGetCustomEndpointConfig.mockReturnValue({
      apiKey,
      baseURL,
      models: { fetch: true },
      headers: overrides.headers,
    });

    const db = {
      getUserKeyValues: jest.fn().mockResolvedValue({
        apiKey: 'sk-user-key',
        baseURL: overrides.userBaseURL ?? 'https://user-api.example.com/v1',
      }),
    } as unknown as BaseInitializeParams['db'];

    return {
      req: {
        user: { id: 'user-1', email: 'user@example.com' },
        body: { key: '2099-01-01' },
        config: {},
      } as unknown as BaseInitializeParams['req'],
      // openrouter is in FetchTokenConfig, so the fetchModels call is reached
      endpoint: 'openrouter',
      model_parameters: { model: 'gpt-4' },
      db,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    fetchModels.mockReset().mockResolvedValue([]);
  });

  it('forwards configured headers and user object to fetchModels for admin-trusted base URL', async () => {
    const headers = {
      Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}',
      'X-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
    };
    const params = createTokenConfigParams({
      apiKey: 'sk-test-key',
      baseURL: 'https://openrouter.ai/api/v1',
      headers,
    });

    await initializeCustom(params);

    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'openrouter',
        headers,
        userObject: params.req.user,
      }),
    );
  });

  it('drops headers when base URL is user-provided (token leak guard)', async () => {
    const headers = {
      Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}',
    };
    const params = createTokenConfigParams({
      apiKey: 'sk-test-key',
      baseURL: AuthType.USER_PROVIDED,
      userBaseURL: 'https://user-controlled.example.com/v1',
      headers,
    });

    await initializeCustom(params);

    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'openrouter',
        headers: undefined,
        userObject: params.req.user,
      }),
    );
  });

  it('uses the unscoped endpoint tokenKey when no user-bound headers are configured', async () => {
    const params = createTokenConfigParams({
      apiKey: 'sk-test-key',
      baseURL: 'https://openrouter.ai/api/v1',
    });

    await initializeCustom(params);

    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'openrouter',
        tokenKey: 'openrouter',
        headers: undefined,
      }),
    );
  });

  it('user-scopes the tokenKey when headers will be forwarded (admin-trusted base URL)', async () => {
    const params = createTokenConfigParams({
      apiKey: 'sk-test-key',
      baseURL: 'https://openrouter.ai/api/v1',
      headers: { Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}' },
    });

    await initializeCustom(params);

    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenKey: 'openrouter:user-1',
      }),
    );
  });

  it('does NOT user-scope the tokenKey when headers are dropped (user-provided base URL)', async () => {
    const params = createTokenConfigParams({
      apiKey: 'sk-test-key',
      baseURL: AuthType.USER_PROVIDED,
      userBaseURL: 'https://user-controlled.example.com/v1',
      headers: { Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}' },
    });

    await initializeCustom(params);

    // baseURL is user-provided so tokenKey is already user-scoped via the
    // existing rule, not via the new headers signal. Either way the value
    // should be the user-scoped key.
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenKey: 'openrouter:user-1',
        headers: undefined,
      }),
    );
  });
});
