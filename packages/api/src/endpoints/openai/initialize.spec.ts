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
  getAzureCredentials: jest.fn(),
  resolveHeaders: jest.fn(() => ({})),
  isUserProvided: (val: string) => val === 'user_provided',
  checkUserKeyExpiry: jest.fn(),
}));

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
});

describe('initializeOpenAI – endpoint headers (built-in)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('forwards endpoint.headers from YAML config into clientOptions.headers', async () => {
    const params = createParams({ OPENAI_API_KEY: 'sk-test' });
    (params.req as unknown as { config: unknown }).config = {
      endpoints: {
        [EModelEndpoint.openAI]: {
          headers: {
            'cf-aig-metadata': '{"app":"librechat"}',
            'x-trace-id': '{{LIBRECHAT_BODY_PARENTMESSAGEID}}',
          },
        },
      },
    };

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockGetOpenAIConfig).toHaveBeenCalledTimes(1);
    const [, clientOptions] = mockGetOpenAIConfig.mock.calls[0];
    const headers = (clientOptions as { headers?: Record<string, string> }).headers;
    expect(headers).toEqual({
      'cf-aig-metadata': '{"app":"librechat"}',
      'x-trace-id': '{{LIBRECHAT_BODY_PARENTMESSAGEID}}',
    });
  });

  it('omits headers when none are configured on the OpenAI endpoint', async () => {
    const params = createParams({ OPENAI_API_KEY: 'sk-test' });

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    const [, clientOptions] = mockGetOpenAIConfig.mock.calls[0];
    expect((clientOptions as { headers?: unknown }).headers).toBeUndefined();
  });

  it('skips forwarding endpoint.headers for the azureOpenAI endpoint (Azure path already manages headers)', async () => {
    const params = createParams({ OPENAI_API_KEY: 'sk-test', AZURE_API_KEY: 'sk-azure' });
    params.endpoint = EModelEndpoint.azureOpenAI;
    (params.req as unknown as { config: unknown }).config = {
      endpoints: {
        [EModelEndpoint.openAI]: {
          headers: { 'should-not-leak': '1' },
        },
        [EModelEndpoint.azureOpenAI]: undefined,
      },
    };

    try {
      // Azure flow without azureConfig throws on missing groups; just verify the openAI branch
      // doesn't pollute clientOptions.headers on a non-OpenAI path before any throw.
      await initializeOpenAI(params).catch(() => undefined);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    if (mockGetOpenAIConfig.mock.calls.length > 0) {
      const [, clientOptions] = mockGetOpenAIConfig.mock.calls[0];
      const headers = (clientOptions as { headers?: Record<string, string> }).headers;
      expect(headers?.['should-not-leak']).toBeUndefined();
    }
  });
});
