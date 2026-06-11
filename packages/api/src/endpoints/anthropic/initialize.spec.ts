import { AuthKeys, EModelEndpoint, ErrorTypes } from 'librechat-data-provider';
import type { BaseInitializeParams } from '~/types';

const mockLoadAnthropicVertexCredentials = jest.fn();
const mockGetVertexCredentialOptions = jest.fn();
jest.mock('./vertex', () => ({
  loadAnthropicVertexCredentials: (...args: unknown[]) =>
    mockLoadAnthropicVertexCredentials(...args),
  getVertexCredentialOptions: (...args: unknown[]) => mockGetVertexCredentialOptions(...args),
}));

const mockGetLLMConfig = jest
  .fn()
  .mockReturnValue({ llmConfig: { model: 'claude-3-7-sonnet-20250219' } });
jest.mock('./llm', () => ({
  getLLMConfig: (...args: unknown[]) => mockGetLLMConfig(...args),
}));

const mockLoadServiceKey = jest.fn();
jest.mock('~/utils', () => ({
  isEnabled: (val?: unknown) => val === 'true' || val === true,
  loadServiceKey: (...args: unknown[]) => mockLoadServiceKey(...args),
  checkUserKeyExpiry: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { initializeAnthropic } from './initialize';

const GLOBAL_SERVICE_KEY = {
  project_id: 'global-project',
  client_email: 'global@global-project.iam.gserviceaccount.com',
  private_key: 'global-private-key',
};

const USER_SERVICE_KEY = {
  project_id: 'user-project',
  client_email: 'user@user-project.iam.gserviceaccount.com',
  private_key: 'user-private-key',
};

function createParams(
  env: Record<string, string | undefined>,
  dbOverrides: Partial<BaseInitializeParams['db']> = {},
  userId: string | null = 'user-1',
): BaseInitializeParams & { _restore: () => void } {
  const savedEnv: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    savedEnv[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  const db = {
    getUserKey: jest.fn(),
    getUserKeyValues: jest.fn(),
    ...dbOverrides,
  } as unknown as BaseInitializeParams['db'];

  const params: BaseInitializeParams = {
    req: {
      user: userId ? { id: userId } : undefined,
      body: {},
      config: { endpoints: {} },
    } as unknown as BaseInitializeParams['req'],
    endpoint: EModelEndpoint.anthropic,
    model_parameters: { model: 'claude-3-7-sonnet-20250219' },
    db,
  };

  const restore = () => {
    for (const key of Object.keys(env)) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  };

  return Object.assign(params, { _restore: restore });
}

describe('initializeAnthropic – per-user Vertex service-account credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadAnthropicVertexCredentials.mockResolvedValue({
      [AuthKeys.GOOGLE_SERVICE_KEY]: GLOBAL_SERVICE_KEY,
    });
    mockGetVertexCredentialOptions.mockReturnValue({});
  });

  it('uses the user-stored Google SA when GOOGLE_KEY=user_provided and a valid key is registered', async () => {
    const storedUserKey = JSON.stringify({
      [AuthKeys.GOOGLE_SERVICE_KEY]: 'stringified-sa-json-from-storage',
    });
    mockLoadServiceKey.mockResolvedValueOnce(USER_SERVICE_KEY);

    const params = createParams(
      {
        ANTHROPIC_USE_VERTEX: 'true',
        GOOGLE_KEY: 'user_provided',
      },
      {
        getUserKey: jest.fn().mockResolvedValue(storedUserKey),
      },
    );

    try {
      await initializeAnthropic(params);
    } finally {
      params._restore();
    }

    expect(params.db.getUserKey).toHaveBeenCalledWith({
      userId: 'user-1',
      name: EModelEndpoint.google,
    });
    expect(mockLoadServiceKey).toHaveBeenCalledWith('stringified-sa-json-from-storage');
    expect(mockLoadAnthropicVertexCredentials).not.toHaveBeenCalled();

    const [credentials] = mockGetLLMConfig.mock.calls[0] as [Record<string, unknown>];
    expect(credentials[AuthKeys.GOOGLE_SERVICE_KEY]).toEqual(USER_SERVICE_KEY);
  });

  it('falls back to global file-based service key when the user has no stored Google key', async () => {
    const noUserKeyErr = new Error(JSON.stringify({ type: ErrorTypes.NO_USER_KEY }));
    const params = createParams(
      {
        ANTHROPIC_USE_VERTEX: 'true',
        GOOGLE_KEY: 'user_provided',
      },
      {
        getUserKey: jest.fn().mockRejectedValue(noUserKeyErr),
      },
    );

    try {
      await initializeAnthropic(params);
    } finally {
      params._restore();
    }

    expect(params.db.getUserKey).toHaveBeenCalled();
    expect(mockLoadAnthropicVertexCredentials).toHaveBeenCalledTimes(1);
    const [credentials] = mockGetLLMConfig.mock.calls[0] as [Record<string, unknown>];
    expect(credentials[AuthKeys.GOOGLE_SERVICE_KEY]).toEqual(GLOBAL_SERVICE_KEY);
  });

  it('falls back to global service key when the stored Google entry is not valid JSON', async () => {
    const params = createParams(
      {
        ANTHROPIC_USE_VERTEX: 'true',
        GOOGLE_KEY: 'user_provided',
      },
      {
        getUserKey: jest.fn().mockResolvedValue('not-json'),
      },
    );

    try {
      await initializeAnthropic(params);
    } finally {
      params._restore();
    }

    expect(mockLoadServiceKey).not.toHaveBeenCalled();
    expect(mockLoadAnthropicVertexCredentials).toHaveBeenCalledTimes(1);
    const [credentials] = mockGetLLMConfig.mock.calls[0] as [Record<string, unknown>];
    expect(credentials[AuthKeys.GOOGLE_SERVICE_KEY]).toEqual(GLOBAL_SERVICE_KEY);
  });

  it('falls back to global service key when loadServiceKey returns a malformed result', async () => {
    const storedUserKey = JSON.stringify({
      [AuthKeys.GOOGLE_SERVICE_KEY]: 'stringified-sa-json',
    });
    mockLoadServiceKey.mockResolvedValueOnce({ project_id: 'only-project-no-private-key' });

    const params = createParams(
      {
        ANTHROPIC_USE_VERTEX: 'true',
        GOOGLE_KEY: 'user_provided',
      },
      {
        getUserKey: jest.fn().mockResolvedValue(storedUserKey),
      },
    );

    try {
      await initializeAnthropic(params);
    } finally {
      params._restore();
    }

    expect(mockLoadAnthropicVertexCredentials).toHaveBeenCalledTimes(1);
    const [credentials] = mockGetLLMConfig.mock.calls[0] as [Record<string, unknown>];
    expect(credentials[AuthKeys.GOOGLE_SERVICE_KEY]).toEqual(GLOBAL_SERVICE_KEY);
  });

  it('does not attempt per-user lookup when GOOGLE_KEY is not set to user_provided', async () => {
    const params = createParams(
      {
        ANTHROPIC_USE_VERTEX: 'true',
        GOOGLE_KEY: 'AIza-some-static-google-api-key',
      },
      {
        getUserKey: jest.fn(),
      },
    );

    try {
      await initializeAnthropic(params);
    } finally {
      params._restore();
    }

    expect(params.db.getUserKey).not.toHaveBeenCalled();
    expect(mockLoadAnthropicVertexCredentials).toHaveBeenCalledTimes(1);
    const [credentials] = mockGetLLMConfig.mock.calls[0] as [Record<string, unknown>];
    expect(credentials[AuthKeys.GOOGLE_SERVICE_KEY]).toEqual(GLOBAL_SERVICE_KEY);
  });

  it('does not attempt per-user lookup when there is no authenticated user', async () => {
    const params = createParams(
      {
        ANTHROPIC_USE_VERTEX: 'true',
        GOOGLE_KEY: 'user_provided',
      },
      { getUserKey: jest.fn() },
      null,
    );

    try {
      await initializeAnthropic(params);
    } finally {
      params._restore();
    }

    expect(params.db.getUserKey).not.toHaveBeenCalled();
    expect(mockLoadAnthropicVertexCredentials).toHaveBeenCalledTimes(1);
  });

  it('handles non-NO_USER_KEY db errors by falling back gracefully', async () => {
    const params = createParams(
      {
        ANTHROPIC_USE_VERTEX: 'true',
        GOOGLE_KEY: 'user_provided',
      },
      {
        getUserKey: jest.fn().mockRejectedValue(new Error('mongo down')),
      },
    );

    try {
      await initializeAnthropic(params);
    } finally {
      params._restore();
    }

    expect(mockLoadAnthropicVertexCredentials).toHaveBeenCalledTimes(1);
    const [credentials] = mockGetLLMConfig.mock.calls[0] as [Record<string, unknown>];
    expect(credentials[AuthKeys.GOOGLE_SERVICE_KEY]).toEqual(GLOBAL_SERVICE_KEY);
  });
});
