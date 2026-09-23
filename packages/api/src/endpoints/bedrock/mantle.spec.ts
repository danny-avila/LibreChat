import { Providers } from '@librechat/agents';
import { getToken } from '@aws/bedrock-token-generator';
import { EModelEndpoint } from 'librechat-data-provider';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { BaseInitializeParams } from '~/types';
import { isBedrockMantleModel, getBedrockMantleBaseURL } from './mantle';
import { initializeBedrock } from './initialize';

jest.mock('@aws/bedrock-token-generator', () => ({
  getToken: jest.fn().mockResolvedValue('generated-short-term-token'),
}));

jest.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: jest.fn().mockImplementation((config) => {
    const provider = jest.fn();
    return Object.assign(provider, { config });
  }),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation((config) => ({
    ...config,
    _isBedrockClient: true,
  })),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  checkUserKeyExpiry: jest.fn(),
}));

const mockedGetToken = jest.mocked(getToken);
const mockedFromNodeProviderChain = jest.mocked(fromNodeProviderChain);

const createMockParams = (
  overrides: Partial<{
    body: Record<string, unknown>;
    model_parameters: Record<string, unknown>;
    userKey: string;
  }> = {},
): BaseInitializeParams => {
  const mockDb = {
    getUserKey: jest.fn().mockResolvedValue(
      overrides.userKey ??
        JSON.stringify({
          accessKeyId: 'user-access-key',
          secretAccessKey: 'user-secret-key',
        }),
    ),
  };

  return {
    req: {
      config: {},
      body: overrides.body ?? {},
      user: { id: 'test-user-id' },
    },
    endpoint: EModelEndpoint.bedrock,
    model_parameters: overrides.model_parameters ?? { model: 'openai.gpt-5.5' },
    db: mockDb,
  } as unknown as BaseInitializeParams;
};

describe('isBedrockMantleModel', () => {
  it('should match OpenAI models that require bedrock-mantle', () => {
    expect(isBedrockMantleModel('openai.gpt-5.5')).toBe(true);
    expect(isBedrockMantleModel('openai.gpt-5.4')).toBe(true);
    expect(isBedrockMantleModel('openai.gpt-5.4-codex')).toBe(true);
  });

  it('should not match Converse-compatible gpt-oss models', () => {
    expect(isBedrockMantleModel('openai.gpt-oss-20b')).toBe(false);
    expect(isBedrockMantleModel('openai.gpt-oss-120b-1:0')).toBe(false);
  });

  it('should not match other providers or empty values', () => {
    expect(isBedrockMantleModel('anthropic.claude-sonnet-4-5')).toBe(false);
    expect(isBedrockMantleModel('us.anthropic.claude-opus-5')).toBe(false);
    expect(isBedrockMantleModel('meta.llama3-70b-instruct-v1:0')).toBe(false);
    expect(isBedrockMantleModel('')).toBe(false);
    expect(isBedrockMantleModel(undefined)).toBe(false);
  });
});

describe('getBedrockMantleBaseURL', () => {
  it('should build the in-region mantle endpoint URL', () => {
    expect(getBedrockMantleBaseURL('us-east-2')).toBe(
      'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
    );
  });

  it('should replace the AWS host with a configured reverse proxy', () => {
    expect(getBedrockMantleBaseURL('us-east-2', 'bedrock-gateway.internal')).toBe(
      'https://bedrock-gateway.internal/openai/v1',
    );
    expect(getBedrockMantleBaseURL('us-east-2', '  ')).toBe(
      'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
    );
  });
});

describe('initializeBedrock mantle routing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.BEDROCK_AWS_BEARER_TOKEN;
    delete process.env.BEDROCK_AWS_PROFILE;
    delete process.env.BEDROCK_AWS_SESSION_TOKEN;
    delete process.env.BEDROCK_REVERSE_PROXY;
    delete process.env.PROXY;
    process.env.BEDROCK_AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.BEDROCK_AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.BEDROCK_AWS_DEFAULT_REGION = 'us-east-1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should route mantle models to the OpenAI-compatible provider', async () => {
    const params = createMockParams();
    const result = await initializeBedrock(params);

    expect(result.provider).toBe(Providers.OPENAI);
    const llmConfig = result.llmConfig as Record<string, unknown>;
    expect(llmConfig.model).toBe('openai.gpt-5.5');
    expect(llmConfig.useResponsesApi).toBe(true);
    expect(llmConfig.apiKey).toBe('generated-short-term-token');
    expect(result.configOptions?.baseURL).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/openai/v1',
    );
  });

  it('should mint a short-term token from static credentials', async () => {
    const params = createMockParams();
    await initializeBedrock(params);

    expect(mockedGetToken).toHaveBeenCalledTimes(1);
    expect(mockedGetToken).toHaveBeenCalledWith({
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      },
      region: 'us-east-1',
    });
  });

  it('should use a static bearer token without minting one', async () => {
    process.env.BEDROCK_AWS_BEARER_TOKEN = 'static-api-key';
    const params = createMockParams();
    const result = await initializeBedrock(params);

    expect(mockedGetToken).not.toHaveBeenCalled();
    expect((result.llmConfig as Record<string, unknown>).apiKey).toBe('static-api-key');
  });

  it('should use a user-provided bearer token without minting one', async () => {
    process.env.BEDROCK_AWS_BEARER_TOKEN = 'user_provided';
    const params = createMockParams({
      userKey: JSON.stringify({ bearerToken: 'user-api-key' }),
    });
    const result = await initializeBedrock(params);

    expect(mockedGetToken).not.toHaveBeenCalled();
    expect((result.llmConfig as Record<string, unknown>).apiKey).toBe('user-api-key');
  });

  it('should prefer the request region over the default region', async () => {
    const params = createMockParams({
      model_parameters: { model: 'openai.gpt-5.5', region: 'us-east-2' },
    });
    const result = await initializeBedrock(params);

    expect(mockedGetToken).toHaveBeenCalledWith(expect.objectContaining({ region: 'us-east-2' }));
    expect(result.configOptions?.baseURL).toBe(
      'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
    );
  });

  it('should route mantle traffic through BEDROCK_REVERSE_PROXY when configured', async () => {
    process.env.BEDROCK_REVERSE_PROXY = 'bedrock-gateway.internal';
    const params = createMockParams();
    const result = await initializeBedrock(params);

    expect(result.configOptions?.baseURL).toBe('https://bedrock-gateway.internal/openai/v1');
  });

  it('should throw when no region is available', async () => {
    delete process.env.BEDROCK_AWS_DEFAULT_REGION;
    const params = createMockParams();

    await expect(initializeBedrock(params)).rejects.toThrow(/region is required/i);
  });

  it('should reject regions that could break out of the mantle URL', async () => {
    const params = createMockParams({
      model_parameters: { model: 'openai.gpt-5.5', region: 'us-east-1.evil.com/openai/v1?' },
    });

    await expect(initializeBedrock(params)).rejects.toThrow(/invalid aws region/i);
    expect(mockedGetToken).not.toHaveBeenCalled();
  });

  it('should fall back to the default credential chain when no static credentials exist', async () => {
    delete process.env.BEDROCK_AWS_ACCESS_KEY_ID;
    delete process.env.BEDROCK_AWS_SECRET_ACCESS_KEY;
    process.env.BEDROCK_AWS_PROFILE = 'bedrock-profile';
    const params = createMockParams();
    await initializeBedrock(params);

    expect(mockedFromNodeProviderChain).toHaveBeenCalledWith({ profile: 'bedrock-profile' });
    expect(mockedGetToken).toHaveBeenCalledWith(
      expect.objectContaining({ credentials: expect.any(Function) }),
    );
  });

  it('should include session tokens when minting a short-term token', async () => {
    process.env.BEDROCK_AWS_SESSION_TOKEN = 'test-session-token';
    const params = createMockParams();
    await initializeBedrock(params);

    expect(mockedGetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
          sessionToken: 'test-session-token',
        },
      }),
    );
  });

  it('should only forward OpenAI-compatible model parameters', async () => {
    const params = createMockParams({
      model_parameters: {
        model: 'openai.gpt-5.5',
        temperature: 0.5,
        topP: 0.9,
        maxTokens: 2048,
        region: 'us-east-1',
        thinking: true,
        thinkingBudget: 2000,
        promptCache: true,
        topK: 40,
        additionalModelRequestFields: { foo: 'bar' },
      },
    });
    const result = await initializeBedrock(params);

    const llmConfig = result.llmConfig as Record<string, unknown>;
    const modelKwargs = llmConfig.modelKwargs as Record<string, unknown> | undefined;
    expect(llmConfig.temperature).toBe(0.5);
    expect(llmConfig.topP).toBe(0.9);
    expect(modelKwargs?.max_output_tokens).toBe(2048);
    expect(llmConfig.user).toBe('test-user-id');
    expect(llmConfig).not.toHaveProperty('region');
    expect(llmConfig).not.toHaveProperty('thinking');
    expect(llmConfig).not.toHaveProperty('thinkingBudget');
    expect(llmConfig).not.toHaveProperty('promptCache');
    expect(llmConfig).not.toHaveProperty('topK');
    expect(llmConfig).not.toHaveProperty('additionalModelRequestFields');
  });

  it('should shape reasoning_effort for the Responses API', async () => {
    const params = createMockParams({
      model_parameters: { model: 'openai.gpt-5.5', reasoning_effort: 'high' },
    });
    const result = await initializeBedrock(params);

    const llmConfig = result.llmConfig as Record<string, unknown>;
    const modelKwargs = llmConfig.modelKwargs as Record<string, unknown> | undefined;
    expect(modelKwargs?.reasoning).toEqual({ effort: 'high' });
    expect(llmConfig).not.toHaveProperty('reasoning_effort');
  });

  it('should keep Converse-compatible models on the default Bedrock path', async () => {
    const params = createMockParams({
      model_parameters: { model: 'openai.gpt-oss-120b' },
    });
    const result = await initializeBedrock(params);

    expect(result.provider).toBeUndefined();
    expect(mockedGetToken).not.toHaveBeenCalled();
    const llmConfig = result.llmConfig as Record<string, unknown>;
    expect(llmConfig.model).toBe('openai.gpt-oss-120b');
    expect(llmConfig.credentials).toEqual({
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });
  });
});
