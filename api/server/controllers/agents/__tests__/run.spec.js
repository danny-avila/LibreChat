jest.mock('@librechat/agents', () => ({
  Run: {
    create: jest.fn(),
  },
  Providers: {
    XAI: 'xai',
    OLLAMA: 'ollama',
    DEEPSEEK: 'deepseek',
    OPENROUTER: 'openrouter',
    ANTHROPIC: 'anthropic',
    BEDROCK: 'bedrock',
    OPENAI: 'openAI',
  },
}));

jest.mock('librechat-data-provider', () => ({
  providerEndpointMap: {},
  KnownEndpoints: {
    openrouter: 'openrouter',
  },
}));

const { Run } = require('@librechat/agents');
const { providerEndpointMap } = require('librechat-data-provider');
const { createRun } = require('../run');

describe('createRun', () => {
  let mockAgent;
  let mockSignal;
  let mockCustomHandlers;
  let mockRunInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAgent = {
      provider: 'openAI',
      endpoint: 'openAI',
      model_parameters: {
        temperature: 0.7,
        max_tokens: 1000,
      },
      tools: ['tool1', 'tool2'],
      instructions: 'Test instructions',
      additional_instructions: 'Additional test instructions',
    };

    mockSignal = new AbortController().signal;
    mockCustomHandlers = {
      onStart: jest.fn(),
      onEnd: jest.fn(),
    };

    mockRunInstance = { id: 'test-run-id' };

    Run.create.mockResolvedValue(mockRunInstance);
    providerEndpointMap.anthropic = 'anthropic';
    providerEndpointMap.openAI = 'openAI';
    providerEndpointMap.bedrock = 'bedrock';
  });

  it('should create a Run instance with all options', async () => {
    const runId = 'custom-run-id';

    const result = await createRun({
      runId,
      agent: mockAgent,
      signal: mockSignal,
      customHandlers: mockCustomHandlers,
      streaming: false,
      streamUsage: false,
    });

    expect(result).toBe(mockRunInstance);
    expect(Run.create).toHaveBeenCalledWith({
      runId: 'custom-run-id',
      graphConfig: {
        signal: mockSignal,
        llmConfig: {
          provider: 'openAI',
          streaming: false,
          streamUsage: false,
          temperature: 0.7,
          max_tokens: 1000,
        },
        reasoningKey: undefined,
        tools: ['tool1', 'tool2'],
        instructions: 'Test instructions',
        additional_instructions: 'Additional test instructions',
      },
      customHandlers: mockCustomHandlers,
    });
  });

  describe('StreamUsage handling', () => {
    it('should disable streamUsage for custom providers', async () => {
      const customProviders = ['xai', 'ollama', 'deepseek', 'openrouter'];

      for (const provider of customProviders) {
        jest.clearAllMocks();
        mockAgent.provider = provider;

        await createRun({ agent: mockAgent, signal: mockSignal });

        const graphConfig = getLastGraphConfig();
        expect(graphConfig.llmConfig.streamUsage).toBe(false);
        expect(graphConfig.llmConfig.usage).toBe(true);
      }
    });

    it('should disable streamUsage for OpenAI with mismatched endpoint', async () => {
      mockAgent.provider = 'openAI';
      mockAgent.endpoint = 'custom-endpoint';

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.llmConfig.streamUsage).toBe(false);
      expect(graphConfig.llmConfig.usage).toBe(true);
    });

    it('should enable streamUsage for OpenAI with matching endpoint', async () => {
      mockAgent.provider = 'openAI';
      mockAgent.endpoint = 'openAI';

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.llmConfig.streamUsage).toBe(true);
      expect(graphConfig.llmConfig.usage).toBeUndefined();
    });
  });

  describe('Reasoning key configuration', () => {
    it('should set reasoning key for OpenRouter configurations', async () => {
      const testCases = [
        {
          setup: () => {
            mockAgent.model_parameters.configuration = {
              baseURL: 'https://openrouter.ai/api/v1',
            };
          },
        },
        {
          setup: () => {
            mockAgent.endpoint = 'OpenRouter-API';
            delete mockAgent.model_parameters.configuration;
          },
        },
        {
          setup: () => {
            mockAgent.endpoint = 'openrouter-custom';
            delete mockAgent.model_parameters.configuration;
          },
        },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        testCase.setup();

        await createRun({ agent: mockAgent, signal: mockSignal });

        const graphConfig = getLastGraphConfig();
        expect(graphConfig.reasoningKey).toBe('reasoning');
      }
    });

    it('should not set reasoning key for non-OpenRouter endpoints', async () => {
      mockAgent.endpoint = 'custom-endpoint';

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.reasoningKey).toBeUndefined();
    });
  });

  describe('Stream buffer configuration', () => {
    it('should set streamBuffer for Anthropic and Bedrock providers', async () => {
      const bufferedProviders = ['anthropic', 'bedrock'];

      for (const provider of bufferedProviders) {
        jest.clearAllMocks();
        mockAgent.provider = provider;

        await createRun({ agent: mockAgent, signal: mockSignal });

        const graphConfig = getLastGraphConfig();
        expect(graphConfig.streamBuffer).toBe(2000);
      }
    });

    it('should not set streamBuffer for other providers', async () => {
      mockAgent.provider = 'openAI';

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.streamBuffer).toBeUndefined();
    });
  });

  describe('Provider endpoint mapping', () => {
    it('should map providers using providerEndpointMap', async () => {
      mockAgent.provider = 'custom-provider';
      providerEndpointMap['custom-provider'] = 'mapped-provider';

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.llmConfig.provider).toBe('mapped-provider');
    });

    it('should use original provider if not in providerEndpointMap', async () => {
      mockAgent.provider = 'unmapped-provider';

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.llmConfig.provider).toBe('unmapped-provider');
    });
  });

  describe('Edge cases', () => {
    it('should handle missing model_parameters', async () => {
      mockAgent.model_parameters = null;

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.llmConfig).toEqual({
        provider: 'openAI',
        streaming: true,
        streamUsage: true,
      });
    });

    it('should handle missing optional agent properties', async () => {
      delete mockAgent.tools;
      delete mockAgent.instructions;
      delete mockAgent.additional_instructions;

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.tools).toBeUndefined();
      expect(graphConfig.instructions).toBeUndefined();
      expect(graphConfig.additional_instructions).toBeUndefined();
    });

    it('should handle undefined streaming options with defaults', async () => {
      await createRun({
        agent: mockAgent,
        signal: mockSignal,
        streaming: undefined,
        streamUsage: undefined,
      });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.llmConfig.streaming).toBe(true);
      expect(graphConfig.llmConfig.streamUsage).toBe(true);
    });

    it('should handle null baseURL in configuration', async () => {
      mockAgent.model_parameters = {
        configuration: { baseURL: null },
      };

      await createRun({ agent: mockAgent, signal: mockSignal });

      const graphConfig = getLastGraphConfig();
      expect(graphConfig.reasoningKey).toBeUndefined();
    });

    it('should handle Run.create errors', async () => {
      const error = new Error('Run creation failed');
      Run.create.mockRejectedValue(error);

      await expect(createRun({ agent: mockAgent, signal: mockSignal })).rejects.toThrow(
        'Run creation failed',
      );
    });
  });
});

function getLastGraphConfig() {
  const lastCall = Run.create.mock.calls[Run.create.mock.calls.length - 1];
  return lastCall[0].graphConfig;
}
