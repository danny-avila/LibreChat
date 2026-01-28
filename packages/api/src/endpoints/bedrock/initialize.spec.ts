import { AuthType, EModelEndpoint } from 'librechat-data-provider';
import { initializeBedrock } from './initialize';
import type { BaseInitializeParams, BedrockLLMConfigResult } from '~/types';
import { checkUserKeyExpiry } from '~/utils';

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn().mockImplementation((proxy) => ({ proxy })),
}));

jest.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: jest.fn().mockImplementation((options) => ({ ...options })),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation((config) => ({
    ...config,
    _isBedrockClient: true,
  })),
}));

jest.mock('~/utils', () => ({
  checkUserKeyExpiry: jest.fn(),
}));

const mockedCheckUserKeyExpiry = jest.mocked(checkUserKeyExpiry);

const createMockParams = (
  overrides: Partial<{
    config: Record<string, unknown>;
    body: Record<string, unknown>;
    user: { id: string };
    model_parameters: Record<string, unknown>;
    env: Record<string, string | undefined>;
  }> = {},
): BaseInitializeParams => {
  const mockDb = {
    getUserKey: jest.fn().mockResolvedValue(
      JSON.stringify({
        accessKeyId: 'user-access-key',
        secretAccessKey: 'user-secret-key',
      }),
    ),
  };

  return {
    req: {
      config: overrides.config ?? {},
      body: overrides.body ?? {},
      user: overrides.user ?? { id: 'test-user-id' },
    },
    endpoint: EModelEndpoint.bedrock,
    model_parameters: overrides.model_parameters ?? { model: 'anthropic.claude-3-sonnet' },
    db: mockDb,
  } as unknown as BaseInitializeParams;
};

describe('initializeBedrock', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.BEDROCK_AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.BEDROCK_AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.BEDROCK_AWS_DEFAULT_REGION = 'us-east-1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Basic Configuration', () => {
    it('should create a basic configuration with credentials from environment', async () => {
      const params = createMockParams();
      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('credentials');
      expect(result.llmConfig.credentials).toEqual({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      });
      expect(result.llmConfig).toHaveProperty('model', 'anthropic.claude-3-sonnet');
    });

    it('should include region from environment', async () => {
      const params = createMockParams();
      const result = await initializeBedrock(params);

      expect(result.llmConfig).toHaveProperty('region', 'us-east-1');
    });

    it('should handle model_parameters', async () => {
      const params = createMockParams({
        model_parameters: {
          model: 'anthropic.claude-3-opus',
          temperature: 0.7,
          maxTokens: 4096,
        },
      });
      const result = await initializeBedrock(params);

      expect(result.llmConfig).toHaveProperty('model', 'anthropic.claude-3-opus');
      expect(result.llmConfig).toHaveProperty('temperature', 0.7);
      expect(result.llmConfig).toHaveProperty('maxTokens', 4096);
    });

    it('should handle session token when provided', async () => {
      process.env.BEDROCK_AWS_SESSION_TOKEN = 'test-session-token';
      const params = createMockParams();
      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig.credentials).toEqual({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
      });
    });
  });

  describe('GuardrailConfig', () => {
    it('should apply guardrailConfig from backend config', async () => {
      const guardrailConfig = {
        guardrailIdentifier: 'test-guardrail-id',
        guardrailVersion: '1',
        trace: 'enabled' as const,
      };

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              guardrailConfig,
            },
          },
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('guardrailConfig');
      expect(result.llmConfig.guardrailConfig).toEqual(guardrailConfig);
    });

    it('should NOT include guardrailConfig when not configured', async () => {
      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {},
          },
        },
      });

      const result = await initializeBedrock(params);

      expect(result.llmConfig).not.toHaveProperty('guardrailConfig');
    });

    it('should apply guardrailConfig regardless of model_parameters', async () => {
      const guardrailConfig = {
        guardrailIdentifier: 'admin-guardrail',
        guardrailVersion: 'DRAFT',
      };

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              guardrailConfig,
            },
          },
        },
        model_parameters: {
          model: 'anthropic.claude-3-sonnet',
          temperature: 0.5,
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig.guardrailConfig).toEqual(guardrailConfig);
      expect(result.llmConfig).toHaveProperty('temperature', 0.5);
    });

    it('should handle guardrailConfig with enabled_full trace', async () => {
      const guardrailConfig = {
        guardrailIdentifier: 'compliance-guardrail',
        guardrailVersion: '2',
        trace: 'enabled_full' as const,
      };

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              guardrailConfig,
            },
          },
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig.guardrailConfig).toEqual(guardrailConfig);
      expect(result.llmConfig.guardrailConfig?.trace).toBe('enabled_full');
    });
  });

  describe('Proxy Configuration', () => {
    it('should create BedrockRuntimeClient with proxy when PROXY is set', async () => {
      process.env.PROXY = 'http://proxy:8080';
      const params = createMockParams();
      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('client');
      expect(result.llmConfig.client).toHaveProperty('_isBedrockClient', true);
      expect(result.llmConfig).not.toHaveProperty('credentials');
    });

    it('should include reverse proxy endpoint when BEDROCK_REVERSE_PROXY is set with PROXY', async () => {
      process.env.PROXY = 'http://proxy:8080';
      process.env.BEDROCK_REVERSE_PROXY = 'custom-bedrock-endpoint.com';
      const params = createMockParams();
      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('client');
      expect(result.llmConfig.client).toHaveProperty(
        'endpoint',
        'https://custom-bedrock-endpoint.com',
      );
    });
  });

  describe('Reverse Proxy Configuration', () => {
    it('should set endpointHost when BEDROCK_REVERSE_PROXY is set without PROXY', async () => {
      process.env.BEDROCK_REVERSE_PROXY = 'reverse-proxy.example.com';
      const params = createMockParams();
      const result = await initializeBedrock(params);

      expect(result.llmConfig).toHaveProperty('endpointHost', 'reverse-proxy.example.com');
      expect(result.llmConfig).not.toHaveProperty('client');
    });
  });

  describe('User-Provided Credentials', () => {
    it('should fetch credentials from database when user-provided', async () => {
      process.env.BEDROCK_AWS_SECRET_ACCESS_KEY = AuthType.USER_PROVIDED;
      const params = createMockParams({
        body: { key: '2024-12-31T23:59:59Z' },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(params.db.getUserKey).toHaveBeenCalledWith({
        userId: 'test-user-id',
        name: EModelEndpoint.bedrock,
      });
      expect(result.llmConfig.credentials).toEqual({
        accessKeyId: 'user-access-key',
        secretAccessKey: 'user-secret-key',
      });
    });

    it('should check key expiry for user-provided credentials', async () => {
      process.env.BEDROCK_AWS_SECRET_ACCESS_KEY = AuthType.USER_PROVIDED;
      const expiresAt = '2024-12-31T23:59:59Z';
      const params = createMockParams({
        body: { key: expiresAt },
      });

      await initializeBedrock(params);

      expect(mockedCheckUserKeyExpiry).toHaveBeenCalledWith(expiresAt, EModelEndpoint.bedrock);
    });
  });

  describe('Credentials Edge Cases', () => {
    it('should set credentials to undefined when access key and secret are empty', async () => {
      process.env.BEDROCK_AWS_ACCESS_KEY_ID = '';
      process.env.BEDROCK_AWS_SECRET_ACCESS_KEY = '';
      const params = createMockParams();
      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig.credentials).toBeUndefined();
    });

    it('should set credentials to undefined when access key and secret are undefined', async () => {
      delete process.env.BEDROCK_AWS_ACCESS_KEY_ID;
      delete process.env.BEDROCK_AWS_SECRET_ACCESS_KEY;
      const params = createMockParams();
      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig.credentials).toBeUndefined();
    });

    it('should throw error when user-provided credentials are not found', async () => {
      process.env.BEDROCK_AWS_SECRET_ACCESS_KEY = AuthType.USER_PROVIDED;
      const params = createMockParams();
      (params.db.getUserKey as jest.Mock).mockResolvedValue(null);

      await expect(initializeBedrock(params)).rejects.toThrow(
        'Bedrock credentials not provided. Please provide them again.',
      );
    });
  });

  describe('Return Structure', () => {
    it('should return llmConfig and configOptions', async () => {
      const params = createMockParams();
      const result = await initializeBedrock(params);

      expect(result).toHaveProperty('llmConfig');
      expect(result).toHaveProperty('configOptions');
      expect(typeof result.configOptions).toBe('object');
    });
  });
});
