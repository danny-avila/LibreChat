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

  describe('Inference Profile Configuration', () => {
    it('should set applicationInferenceProfile when model has matching inference profile config', async () => {
      const inferenceProfileArn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123';

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': inferenceProfileArn,
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('applicationInferenceProfile', inferenceProfileArn);
    });

    it('should NOT set applicationInferenceProfile when model has no matching config', async () => {
      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0':
                  'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/xyz789',
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0', // Different model
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).not.toHaveProperty('applicationInferenceProfile');
    });

    it('should resolve environment variable in inference profile ARN', async () => {
      const inferenceProfileArn =
        'arn:aws:bedrock:us-east-1:951834775723:application-inference-profile/yjr1elcyt29s';
      process.env.BEDROCK_INFERENCE_PROFILE_ARN = inferenceProfileArn;

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': '${BEDROCK_INFERENCE_PROFILE_ARN}',
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('applicationInferenceProfile', inferenceProfileArn);
    });

    it('should use direct ARN when no env variable syntax is used', async () => {
      const directArn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/direct123';

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': directArn,
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('applicationInferenceProfile', directArn);
    });

    it('should fall back to original string when env variable is not set', async () => {
      // Ensure the env var is not set
      delete process.env.NONEXISTENT_PROFILE_ARN;

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': '${NONEXISTENT_PROFILE_ARN}',
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      // Should return the original ${VAR} string when env var doesn't exist
      expect(result.llmConfig).toHaveProperty(
        'applicationInferenceProfile',
        '${NONEXISTENT_PROFILE_ARN}',
      );
    });

    it('should resolve multiple different env variables for different models', async () => {
      const claude37Arn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/claude37';
      const sonnet45Arn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/sonnet45';

      process.env.CLAUDE_37_PROFILE = claude37Arn;
      process.env.SONNET_45_PROFILE = sonnet45Arn;

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': '${CLAUDE_37_PROFILE}',
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0': '${SONNET_45_PROFILE}',
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('applicationInferenceProfile', claude37Arn);
    });

    it('should handle env variable with whitespace around it', async () => {
      const inferenceProfileArn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/trimmed';
      process.env.TRIMMED_PROFILE_ARN = inferenceProfileArn;

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': '  ${TRIMMED_PROFILE_ARN}  ',
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('applicationInferenceProfile', inferenceProfileArn);
    });

    it('should NOT set applicationInferenceProfile when inferenceProfiles config is empty', async () => {
      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {},
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).not.toHaveProperty('applicationInferenceProfile');
    });

    it('should NOT set applicationInferenceProfile when no bedrock config exists', async () => {
      const params = createMockParams({
        config: {},
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).not.toHaveProperty('applicationInferenceProfile');
    });

    it('should handle multiple inference profiles and select the correct one', async () => {
      const sonnet45Arn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/sonnet45';
      const claude37Arn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/claude37';

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0': sonnet45Arn,
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': claude37Arn,
                'global.anthropic.claude-opus-4-5-20251101-v1:0':
                  'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/opus45',
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('applicationInferenceProfile', claude37Arn);
    });

    it('should work alongside guardrailConfig', async () => {
      const inferenceProfileArn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123';
      const guardrailConfig = {
        guardrailIdentifier: 'test-guardrail',
        guardrailVersion: '1',
      };

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': inferenceProfileArn,
              },
              guardrailConfig,
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig).toHaveProperty('applicationInferenceProfile', inferenceProfileArn);
      expect(result.llmConfig).toHaveProperty('guardrailConfig', guardrailConfig);
    });

    it('should preserve the original model ID in llmConfig.model', async () => {
      const inferenceProfileArn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123';

      const params = createMockParams({
        config: {
          endpoints: {
            [EModelEndpoint.bedrock]: {
              inferenceProfiles: {
                'us.anthropic.claude-3-7-sonnet-20250219-v1:0': inferenceProfileArn,
              },
            },
          },
        },
        model_parameters: {
          model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      // Model ID should remain unchanged - only applicationInferenceProfile should be set
      expect(result.llmConfig).toHaveProperty(
        'model',
        'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      );
      expect(result.llmConfig).toHaveProperty('applicationInferenceProfile', inferenceProfileArn);
    });
  });

  describe('Opus 4.6 Adaptive Thinking', () => {
    it('should configure adaptive thinking with default maxTokens for Opus 4.6', async () => {
      const params = createMockParams({
        model_parameters: {
          model: 'anthropic.claude-opus-4-6-v1',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;
      const amrf = result.llmConfig.additionalModelRequestFields as Record<string, unknown>;

      expect(amrf.thinking).toEqual({ type: 'adaptive' });
      expect(result.llmConfig.maxTokens).toBe(16000);
      expect(amrf.anthropic_beta).toEqual(
        expect.arrayContaining(['output-128k-2025-02-19', 'context-1m-2025-08-07']),
      );
    });

    it('should pass effort via output_config for Opus 4.6', async () => {
      const params = createMockParams({
        model_parameters: {
          model: 'anthropic.claude-opus-4-6-v1',
          effort: 'medium',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;
      const amrf = result.llmConfig.additionalModelRequestFields as Record<string, unknown>;

      expect(amrf.thinking).toEqual({ type: 'adaptive' });
      expect(amrf.output_config).toEqual({ effort: 'medium' });
    });

    it('should respect user-provided maxTokens for Opus 4.6', async () => {
      const params = createMockParams({
        model_parameters: {
          model: 'anthropic.claude-opus-4-6-v1',
          maxTokens: 32000,
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;

      expect(result.llmConfig.maxTokens).toBe(32000);
    });

    it('should handle cross-region Opus 4.6 model IDs', async () => {
      const params = createMockParams({
        model_parameters: {
          model: 'us.anthropic.claude-opus-4-6-v1',
          effort: 'low',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;
      const amrf = result.llmConfig.additionalModelRequestFields as Record<string, unknown>;

      expect(result.llmConfig).toHaveProperty('model', 'us.anthropic.claude-opus-4-6-v1');
      expect(amrf.thinking).toEqual({ type: 'adaptive' });
      expect(amrf.output_config).toEqual({ effort: 'low' });
    });

    it('should use enabled thinking for non-adaptive models (Sonnet 4.5)', async () => {
      const params = createMockParams({
        model_parameters: {
          model: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;
      const amrf = result.llmConfig.additionalModelRequestFields as Record<string, unknown>;

      expect(amrf.thinking).toEqual({ type: 'enabled', budget_tokens: 2000 });
      expect(amrf.output_config).toBeUndefined();
      expect(result.llmConfig.maxTokens).toBe(8192);
    });

    it('should not include output_config when effort is empty', async () => {
      const params = createMockParams({
        model_parameters: {
          model: 'anthropic.claude-opus-4-6-v1',
          effort: '',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;
      const amrf = result.llmConfig.additionalModelRequestFields as Record<string, unknown>;

      expect(amrf.thinking).toEqual({ type: 'adaptive' });
      expect(amrf.output_config).toBeUndefined();
    });

    it('should strip effort for non-adaptive models', async () => {
      const params = createMockParams({
        model_parameters: {
          model: 'anthropic.claude-opus-4-1-20250805-v1:0',
          effort: 'high',
        },
      });

      const result = (await initializeBedrock(params)) as BedrockLLMConfigResult;
      const amrf = result.llmConfig.additionalModelRequestFields as Record<string, unknown>;

      expect(amrf.thinking).toEqual({ type: 'enabled', budget_tokens: 2000 });
      expect(amrf.output_config).toBeUndefined();
      expect(amrf.effort).toBeUndefined();
    });
  });
});
