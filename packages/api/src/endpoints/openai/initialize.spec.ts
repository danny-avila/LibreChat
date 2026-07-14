import { AuthType, EModelEndpoint } from 'librechat-data-provider';
import type { BaseInitializeParams } from '~/types';

const mockValidateEndpointURL = jest.fn();
jest.mock('~/auth', () => ({
  validateEndpointURL: (...args: unknown[]) => mockValidateEndpointURL(...args),
}));

const mockGetOpenAIConfig = jest.fn().mockReturnValue({
  llmConfig: { model: 'gpt-4' },
  configOptions: {},
});
jest.mock('./config', () => ({
  getOpenAIConfig: (...args: unknown[]) => mockGetOpenAIConfig(...args),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  getAzureCredentials: jest.fn(),
  resolveHeaders: jest.fn(() => ({})),
  isUserProvided: (val: string) => val === 'user_provided',
  checkUserKeyExpiry: jest.fn(),
}));

import { getAzureCredentials } from '~/utils';
import { initializeOpenAI } from './initialize';

function createParams(env: Record<string, string | undefined>): BaseInitializeParams {
  const savedEnv: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    savedEnv[key] = process.env[key];
  }
  Object.assign(process.env, env);

  const db = {
    getUserKeyValues: jest.fn().mockResolvedValue({
      apiKey: 'sk-user-key',
      baseURL: 'https://user-proxy.example.com/v1',
    }),
  } as unknown as BaseInitializeParams['db'];

  const params: BaseInitializeParams = {
    req: {
      user: { id: 'user-1' },
      body: { key: '2099-01-01' },
      config: { endpoints: {} },
    } as unknown as BaseInitializeParams['req'],
    endpoint: EModelEndpoint.openAI,
    model_parameters: { model: 'gpt-4' },
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

describe('initializeOpenAI – SSRF guard wiring', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call validateEndpointURL when OPENAI_REVERSE_PROXY is user_provided', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: AuthType.USER_PROVIDED,
    });

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockValidateEndpointURL).toHaveBeenCalledTimes(1);
    expect(mockValidateEndpointURL).toHaveBeenCalledWith(
      'https://user-proxy.example.com/v1',
      EModelEndpoint.openAI,
      undefined,
    );
    expect(mockGetOpenAIConfig).toHaveBeenCalledWith(
      'sk-test',
      expect.objectContaining({
        reverseProxyUrl: 'https://user-proxy.example.com/v1',
        baseURLIsUserProvided: true,
        allowedAddresses: undefined,
      }),
      EModelEndpoint.openAI,
    );
  });

  it('should NOT call validateEndpointURL when OPENAI_REVERSE_PROXY is a system URL', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: 'https://api.openai.com/v1',
    });

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockValidateEndpointURL).not.toHaveBeenCalled();
  });

  it('should NOT call validateEndpointURL when baseURL is falsy', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
    });

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockValidateEndpointURL).not.toHaveBeenCalled();
  });

  it('should propagate SSRF rejection from validateEndpointURL', async () => {
    mockValidateEndpointURL.mockRejectedValueOnce(
      new Error('Base URL for openAI targets a restricted address.'),
    );

    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: AuthType.USER_PROVIDED,
    });

    try {
      await expect(initializeOpenAI(params)).rejects.toThrow('targets a restricted address');
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockGetOpenAIConfig).not.toHaveBeenCalled();
  });

  it('should not validate a stale user Azure URL when an admin model group baseURL is selected', async () => {
    const params = createParams({
      AZURE_API_KEY: 'az-env-key',
      AZURE_OPENAI_BASEURL: AuthType.USER_PROVIDED,
    });
    params.endpoint = EModelEndpoint.azureOpenAI;
    params.model_parameters = { model: 'gpt-4o' };
    params.req.config = {
      endpoints: {
        [EModelEndpoint.azureOpenAI]: {
          modelGroupMap: {
            'gpt-4o': { group: 'serverless-group' },
          },
          groupMap: {
            'serverless-group': {
              apiKey: 'az-admin-key',
              baseURL: 'https://admin-azure.example.com/openai/deployments/gpt-4o',
              version: '2024-10-21',
              serverless: true,
            },
          },
        },
      },
    } as unknown as BaseInitializeParams['req']['config'];

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockValidateEndpointURL).not.toHaveBeenCalled();
    expect(mockGetOpenAIConfig).toHaveBeenCalledWith(
      'az-admin-key',
      expect.objectContaining({
        reverseProxyUrl: 'https://admin-azure.example.com/openai/deployments/gpt-4o',
        baseURLIsUserProvided: false,
      }),
      EModelEndpoint.azureOpenAI,
    );
  });
});

describe('initializeOpenAI – custom headers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('forwards configured endpoint headers (merged over endpoints.all) to getOpenAIConfig', async () => {
    const params = createParams({ OPENAI_API_KEY: 'sk-test' });
    (params.req.config as { endpoints: Record<string, unknown> }).endpoints = {
      all: { headers: { 'X-Common': 'all', 'X-Override': 'all' } },
      [EModelEndpoint.openAI]: {
        headers: { 'X-Override': 'openai', 'cf-aig-metadata': '{{LIBRECHAT_BODY_CONVERSATIONID}}' },
      },
    };

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    const options = mockGetOpenAIConfig.mock.calls[0][1] as { headers?: Record<string, string> };
    expect(options.headers).toEqual({
      'X-Common': 'all',
      'X-Override': 'openai',
      'cf-aig-metadata': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
    });
  });

  it('does not set headers when none are configured', async () => {
    const params = createParams({ OPENAI_API_KEY: 'sk-test' });

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    const options = mockGetOpenAIConfig.mock.calls[0][1] as { headers?: Record<string, string> };
    expect(options.headers).toBeUndefined();
  });

  it('withholds configured headers when the user supplies the base URL', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: AuthType.USER_PROVIDED,
    });
    (params.req.config as { endpoints: Record<string, unknown> }).endpoints = {
      [EModelEndpoint.openAI]: { headers: { 'X-Secret': '${GATEWAY_SECRET}' } },
    };

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    const options = mockGetOpenAIConfig.mock.calls[0][1] as { headers?: Record<string, string> };
    expect(options.headers).toBeUndefined();
  });

  it('applies endpoints.all headers to the env-based Azure path, unresolved at init', async () => {
    (getAzureCredentials as jest.Mock).mockReturnValueOnce({ azureOpenAIApiKey: 'az-key' });
    const params = createParams({ AZURE_API_KEY: 'az-key' });
    params.endpoint = EModelEndpoint.azureOpenAI;
    (params.req.config as { endpoints: Record<string, unknown> }).endpoints = {
      all: { headers: { 'X-Global': '{{LIBRECHAT_USER_ID}}' } },
    };

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    const options = mockGetOpenAIConfig.mock.calls[0][1] as { headers?: Record<string, string> };
    // Left unresolved here; request-time resolveConfigHeaders resolves it once
    expect(options.headers).toEqual({ 'X-Global': '{{LIBRECHAT_USER_ID}}' });
  });
});

describe('initializeOpenAI – GPT-5.6 managed fields', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('generates private safety and cache identifiers only for official OpenAI', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: 'https://api.openai.com/v1',
      CREDS_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    params.model_parameters = {
      model: 'gpt-5.6-sol',
      promptCache: true,
      priorityProcessing: true,
    };
    params.req.user = {
      id: 'user-raw-id',
      tenantId: 'tenant-raw-id',
    } as BaseInitializeParams['req']['user'];

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    const options = mockGetOpenAIConfig.mock.calls[0][1] as {
      modelOptions: Record<string, unknown>;
    };
    expect(options.modelOptions).toMatchObject({
      firstPartyOpenAI: true,
      promptCacheExplicit: true,
    });
    expect(options.modelOptions.safety_identifier).toMatch(/^[a-f0-9]{64}$/);
    expect(options.modelOptions.promptCacheKey).toMatch(/^[a-f0-9]{64}$/);
    expect(options.modelOptions.safety_identifier).not.toContain('user-raw-id');
    expect(options.modelOptions.promptCacheKey).not.toContain('tenant-raw-id');
  });

  it('does not generate managed identifiers for an OpenAI-compatible proxy', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: 'https://compatible.example.com/v1',
    });
    params.model_parameters = {
      model: 'gpt-5.6',
      promptCache: true,
      priorityProcessing: true,
    };

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    const options = mockGetOpenAIConfig.mock.calls[0][1] as {
      modelOptions: Record<string, unknown>;
    };
    expect(options.modelOptions.firstPartyOpenAI).toBe(false);
    expect(options.modelOptions).not.toHaveProperty('safety_identifier');
    expect(options.modelOptions).not.toHaveProperty('promptCacheKey');
    expect(options.modelOptions).not.toHaveProperty('promptCacheExplicit');
  });

  it('selects an alternate Azure priority route and retains both billing configs internally', async () => {
    mockGetOpenAIConfig.mockReturnValueOnce({
      llmConfig: { model: 'gpt-5.6' },
      configOptions: {},
    });
    const params = createParams({
      AZURE_API_KEY: 'az-env-key',
      CREDS_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    params.endpoint = EModelEndpoint.azureOpenAI;
    params.model_parameters = {
      model: 'gpt-5.6',
      priorityProcessing: true,
      promptCache: true,
    };
    params.req.config = {
      endpoints: {
        [EModelEndpoint.azureOpenAI]: {
          tokenConfig: {
            'gpt-5.6': {
              prompt: 5,
              completion: 30,
              context: 1050000,
              cacheRead: 0.5,
              cacheWrite: 6.25,
            },
          },
          modelGroupMap: {
            'gpt-5.6': { group: 'primary' },
          },
          groupMap: {
            primary: {
              apiKey: 'standard-key',
              instanceName: 'standard-instance',
              deploymentName: 'standard-deployment',
              version: 'v1',
              models: {
                'gpt-5.6': {
                  priority: {
                    apiKey: 'priority-key',
                    instanceName: 'priority-instance',
                    deploymentName: 'priority-deployment',
                    tokenConfig: {
                      prompt: 10,
                      completion: 60,
                      context: 1050000,
                      cacheRead: 1,
                      cacheWrite: 12.5,
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as unknown as BaseInitializeParams['req']['config'];

    let result!: Awaited<ReturnType<typeof initializeOpenAI>>;
    try {
      result = await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    const [apiKey, options] = mockGetOpenAIConfig.mock.calls[0] as [
      string,
      { azure?: Record<string, string>; modelOptions: Record<string, unknown> },
    ];
    expect(apiKey).toBe('priority-key');
    expect(options.azure).toMatchObject({
      azureOpenAIApiInstanceName: 'priority-instance',
      azureOpenAIApiDeploymentName: 'priority-deployment',
    });
    expect(options.modelOptions).toMatchObject({
      firstPartyOpenAI: true,
      promptCacheExplicit: false,
    });
    expect(result.endpointTokenConfig).toEqual({
      'gpt-5.6': {
        prompt: 5,
        completion: 30,
        context: 1050000,
        read: 0.5,
        write: 6.25,
      },
      'gpt-5.6:priority': {
        prompt: 10,
        completion: 60,
        context: 1050000,
        read: 1,
        write: 12.5,
      },
      'priority-deployment': {
        prompt: 5,
        completion: 30,
        context: 1050000,
        read: 0.5,
        write: 6.25,
      },
      'priority-deployment:priority': {
        prompt: 10,
        completion: 60,
        context: 1050000,
        read: 1,
        write: 12.5,
      },
    });
  });
});
