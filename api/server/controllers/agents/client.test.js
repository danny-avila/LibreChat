const { Providers } = require('@librechat/agents');
const { Constants, EModelEndpoint } = require('librechat-data-provider');
const AgentClient = require('./client');

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  createMetadataAggregator: () => ({
    handleLLMEnd: jest.fn(),
    collected: [],
  }),
}));

describe('AgentClient - titleConvo', () => {
  let client;
  let mockRun;
  let mockReq;
  let mockRes;
  let mockAgent;
  let mockOptions;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock run object
    mockRun = {
      generateTitle: jest.fn().mockResolvedValue({
        title: 'Generated Title',
      }),
    };

    // Mock agent - with both endpoint and provider
    mockAgent = {
      id: 'agent-123',
      endpoint: EModelEndpoint.openAI, // Use a valid provider as endpoint for getProviderConfig
      provider: EModelEndpoint.openAI, // Add provider property
      model_parameters: {
        model: 'gpt-4',
      },
    };

    // Mock request and response
    mockReq = {
      app: {
        locals: {
          [EModelEndpoint.openAI]: {
            // Match the agent endpoint
            titleModel: 'gpt-3.5-turbo',
            titlePrompt: 'Custom title prompt',
            titleMethod: 'structured',
            titlePromptTemplate: 'Template: {{content}}',
          },
        },
      },
      user: {
        id: 'user-123',
      },
      body: {
        model: 'gpt-4',
        endpoint: EModelEndpoint.openAI,
        key: null,
      },
    };

    mockRes = {};

    // Mock options
    mockOptions = {
      req: mockReq,
      res: mockRes,
      agent: mockAgent,
      endpointTokenConfig: {},
    };

    // Create client instance
    client = new AgentClient(mockOptions);
    client.run = mockRun;
    client.responseMessageId = 'response-123';
    client.conversationId = 'convo-123';
    client.contentParts = [{ type: 'text', text: 'Test content' }];
    client.recordCollectedUsage = jest.fn().mockResolvedValue(); // Mock as async function that resolves
  });

  describe('titleConvo method', () => {
    it('should throw error if run is not initialized', async () => {
      client.run = null;

      await expect(
        client.titleConvo({ text: 'Test', abortController: new AbortController() }),
      ).rejects.toThrow('Run not initialized');
    });

    it('should use titlePrompt from endpoint config', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titlePrompt: 'Custom title prompt',
        }),
      );
    });

    it('should use titlePromptTemplate from endpoint config', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titlePromptTemplate: 'Template: {{content}}',
        }),
      );
    });

    it('should use titleMethod from endpoint config', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Providers.OPENAI,
          titleMethod: 'structured',
        }),
      );
    });

    it('should use titleModel from endpoint config when provided', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Check that generateTitle was called with correct clientOptions
      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-3.5-turbo');
    });

    it('should handle missing endpoint config gracefully', async () => {
      // Remove endpoint config
      mockReq.app.locals[EModelEndpoint.openAI] = undefined;

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titlePrompt: undefined,
          titlePromptTemplate: undefined,
          titleMethod: undefined,
        }),
      );
    });

    it('should use agent model when titleModel is not provided', async () => {
      // Remove titleModel from config
      delete mockReq.app.locals[EModelEndpoint.openAI].titleModel;

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-4'); // Should use agent's model
    });

    it('should not use titleModel when it equals CURRENT_MODEL constant', async () => {
      mockReq.app.locals[EModelEndpoint.openAI].titleModel = Constants.CURRENT_MODEL;

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-4'); // Should use agent's model
    });

    it('should pass all required parameters to generateTitle', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith({
        provider: expect.any(String),
        inputText: text,
        contentParts: client.contentParts,
        clientOptions: expect.objectContaining({
          model: 'gpt-3.5-turbo',
        }),
        titlePrompt: 'Custom title prompt',
        titlePromptTemplate: 'Template: {{content}}',
        titleMethod: 'structured',
        chainOptions: expect.objectContaining({
          signal: abortController.signal,
        }),
      });
    });

    it('should record collected usage after title generation', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(client.recordCollectedUsage).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        context: 'title',
        collectedUsage: expect.any(Array),
      });
    });

    it('should return the generated title', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      expect(result).toBe('Generated Title');
    });

    it('should handle errors gracefully and return undefined', async () => {
      mockRun.generateTitle.mockRejectedValue(new Error('Title generation failed'));

      const text = 'Test conversation text';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      expect(result).toBeUndefined();
    });

    it('should pass titleEndpoint configuration to generateTitle', async () => {
      // Mock the API key just for this test
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      // Add titleEndpoint to the config
      mockReq.app.locals[EModelEndpoint.openAI].titleEndpoint = EModelEndpoint.anthropic;
      mockReq.app.locals[EModelEndpoint.openAI].titleMethod = 'structured';
      mockReq.app.locals[EModelEndpoint.openAI].titlePrompt = 'Custom title prompt';
      mockReq.app.locals[EModelEndpoint.openAI].titlePromptTemplate = 'Custom template';

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Verify generateTitle was called with the custom configuration
      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titleMethod: 'structured',
          provider: Providers.ANTHROPIC,
          titlePrompt: 'Custom title prompt',
          titlePromptTemplate: 'Custom template',
        }),
      );

      // Restore the original API key
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should use all config when endpoint config is missing', async () => {
      // Remove endpoint-specific config
      delete mockReq.app.locals[EModelEndpoint.openAI].titleModel;
      delete mockReq.app.locals[EModelEndpoint.openAI].titlePrompt;
      delete mockReq.app.locals[EModelEndpoint.openAI].titleMethod;
      delete mockReq.app.locals[EModelEndpoint.openAI].titlePromptTemplate;

      // Set 'all' config
      mockReq.app.locals.all = {
        titleModel: 'gpt-4o-mini',
        titlePrompt: 'All config title prompt',
        titleMethod: 'completion',
        titlePromptTemplate: 'All config template: {{content}}',
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Verify generateTitle was called with 'all' config values
      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titleMethod: 'completion',
          titlePrompt: 'All config title prompt',
          titlePromptTemplate: 'All config template: {{content}}',
        }),
      );

      // Check that the model was set from 'all' config
      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-4o-mini');
    });

    it('should prioritize all config over endpoint config for title settings', async () => {
      // Set both endpoint and 'all' config
      mockReq.app.locals[EModelEndpoint.openAI].titleModel = 'gpt-3.5-turbo';
      mockReq.app.locals[EModelEndpoint.openAI].titlePrompt = 'Endpoint title prompt';
      mockReq.app.locals[EModelEndpoint.openAI].titleMethod = 'structured';
      // Remove titlePromptTemplate from endpoint config to test fallback
      delete mockReq.app.locals[EModelEndpoint.openAI].titlePromptTemplate;

      mockReq.app.locals.all = {
        titleModel: 'gpt-4o-mini',
        titlePrompt: 'All config title prompt',
        titleMethod: 'completion',
        titlePromptTemplate: 'All config template',
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Verify 'all' config takes precedence over endpoint config
      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titleMethod: 'completion',
          titlePrompt: 'All config title prompt',
          titlePromptTemplate: 'All config template',
        }),
      );

      // Check that the model was set from 'all' config
      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-4o-mini');
    });

    it('should use all config with titleEndpoint and verify provider switch', async () => {
      // Mock the API key for the titleEndpoint provider
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      // Remove endpoint-specific config to test 'all' config
      delete mockReq.app.locals[EModelEndpoint.openAI];

      // Set comprehensive 'all' config with all new title options
      mockReq.app.locals.all = {
        titleConvo: true,
        titleModel: 'claude-3-haiku-20240307',
        titleMethod: 'completion', // Testing the new default method
        titlePrompt: 'Generate a concise, descriptive title for this conversation',
        titlePromptTemplate: 'Conversation summary: {{content}}',
        titleEndpoint: EModelEndpoint.anthropic, // Should switch provider to Anthropic
      };

      const text = 'Test conversation about AI and machine learning';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Verify all config values were used
      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Providers.ANTHROPIC, // Critical: Verify provider switched to Anthropic
          titleMethod: 'completion',
          titlePrompt: 'Generate a concise, descriptive title for this conversation',
          titlePromptTemplate: 'Conversation summary: {{content}}',
          inputText: text,
          contentParts: client.contentParts,
        }),
      );

      // Verify the model was set from 'all' config
      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('claude-3-haiku-20240307');

      // Verify other client options are set correctly
      expect(generateTitleCall.clientOptions).toMatchObject({
        model: 'claude-3-haiku-20240307',
        // Note: Anthropic's getOptions may set its own maxTokens value
      });

      // Restore the original API key
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should test all titleMethod options from all config', async () => {
      // Test each titleMethod: 'completion', 'functions', 'structured'
      const titleMethods = ['completion', 'functions', 'structured'];

      for (const method of titleMethods) {
        // Clear previous calls
        mockRun.generateTitle.mockClear();

        // Remove endpoint config
        delete mockReq.app.locals[EModelEndpoint.openAI];

        // Set 'all' config with specific titleMethod
        mockReq.app.locals.all = {
          titleModel: 'gpt-4o-mini',
          titleMethod: method,
          titlePrompt: `Testing ${method} method`,
          titlePromptTemplate: `Template for ${method}: {{content}}`,
        };

        const text = `Test conversation for ${method} method`;
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify the correct titleMethod was used
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            titleMethod: method,
            titlePrompt: `Testing ${method} method`,
            titlePromptTemplate: `Template for ${method}: {{content}}`,
          }),
        );
      }
    });

    describe('Azure-specific title generation', () => {
      let originalEnv;

      beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Save original environment variables
        originalEnv = { ...process.env };

        // Mock Azure API keys
        process.env.AZURE_OPENAI_API_KEY = 'test-azure-key';
        process.env.AZURE_API_KEY = 'test-azure-key';
        process.env.EASTUS_API_KEY = 'test-eastus-key';
        process.env.EASTUS2_API_KEY = 'test-eastus2-key';
      });

      afterEach(() => {
        // Restore environment variables
        process.env = originalEnv;
      });

      it('should use OPENAI provider for Azure serverless endpoints', async () => {
        // Set up Azure endpoint with serverless config
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockReq.app.locals[EModelEndpoint.azureOpenAI] = {
          titleConvo: true,
          titleModel: 'grok-3',
          titleMethod: 'completion',
          titlePrompt: 'Azure serverless title prompt',
          streamRate: 35,
          modelGroupMap: {
            'grok-3': {
              group: 'Azure AI Foundry',
              deploymentName: 'grok-3',
            },
          },
          groupMap: {
            'Azure AI Foundry': {
              apiKey: '${AZURE_API_KEY}',
              baseURL: 'https://test.services.ai.azure.com/models',
              version: '2024-05-01-preview',
              serverless: true,
              models: {
                'grok-3': {
                  deploymentName: 'grok-3',
                },
              },
            },
          },
        };
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'grok-3';

        const text = 'Test Azure serverless conversation';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify provider was switched to OPENAI for serverless
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: Providers.OPENAI, // Should be OPENAI for serverless
            titleMethod: 'completion',
            titlePrompt: 'Azure serverless title prompt',
          }),
        );
      });

      it('should use AZURE provider for Azure endpoints with instanceName', async () => {
        // Set up Azure endpoint
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockReq.app.locals[EModelEndpoint.azureOpenAI] = {
          titleConvo: true,
          titleModel: 'gpt-4o',
          titleMethod: 'structured',
          titlePrompt: 'Azure instance title prompt',
          streamRate: 35,
          modelGroupMap: {
            'gpt-4o': {
              group: 'eastus',
              deploymentName: 'gpt-4o',
            },
          },
          groupMap: {
            eastus: {
              apiKey: '${EASTUS_API_KEY}',
              instanceName: 'region-instance',
              version: '2024-02-15-preview',
              models: {
                'gpt-4o': {
                  deploymentName: 'gpt-4o',
                },
              },
            },
          },
        };
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'gpt-4o';

        const text = 'Test Azure instance conversation';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify provider remains AZURE with instanceName
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: Providers.AZURE,
            titleMethod: 'structured',
            titlePrompt: 'Azure instance title prompt',
          }),
        );
      });

      it('should handle Azure titleModel with CURRENT_MODEL constant', async () => {
        // Set up Azure endpoint
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockAgent.model_parameters.model = 'gpt-4o-latest';
        mockReq.app.locals[EModelEndpoint.azureOpenAI] = {
          titleConvo: true,
          titleModel: Constants.CURRENT_MODEL,
          titleMethod: 'functions',
          streamRate: 35,
          modelGroupMap: {
            'gpt-4o-latest': {
              group: 'region-eastus',
              deploymentName: 'gpt-4o-mini',
              version: '2024-02-15-preview',
            },
          },
          groupMap: {
            'region-eastus': {
              apiKey: '${EASTUS2_API_KEY}',
              instanceName: 'test-instance',
              version: '2024-12-01-preview',
              models: {
                'gpt-4o-latest': {
                  deploymentName: 'gpt-4o-mini',
                  version: '2024-02-15-preview',
                },
              },
            },
          },
        };
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'gpt-4o-latest';

        const text = 'Test Azure current model';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify it uses the correct model when titleModel is CURRENT_MODEL
        const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
        // When CURRENT_MODEL is used with Azure, the model gets mapped to the deployment name
        // In this case, 'gpt-4o-latest' is mapped to 'gpt-4o-mini' deployment
        expect(generateTitleCall.clientOptions.model).toBe('gpt-4o-mini');
        // Also verify that CURRENT_MODEL constant was not passed as the model
        expect(generateTitleCall.clientOptions.model).not.toBe(Constants.CURRENT_MODEL);
      });

      it('should handle Azure with multiple model groups', async () => {
        // Set up Azure endpoint
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockReq.app.locals[EModelEndpoint.azureOpenAI] = {
          titleConvo: true,
          titleModel: 'o1-mini',
          titleMethod: 'completion',
          streamRate: 35,
          modelGroupMap: {
            'gpt-4o': {
              group: 'eastus',
              deploymentName: 'gpt-4o',
            },
            'o1-mini': {
              group: 'region-eastus',
              deploymentName: 'o1-mini',
            },
            'codex-mini': {
              group: 'codex-mini',
              deploymentName: 'codex-mini',
            },
          },
          groupMap: {
            eastus: {
              apiKey: '${EASTUS_API_KEY}',
              instanceName: 'region-eastus',
              version: '2024-02-15-preview',
              models: {
                'gpt-4o': {
                  deploymentName: 'gpt-4o',
                },
              },
            },
            'region-eastus': {
              apiKey: '${EASTUS2_API_KEY}',
              instanceName: 'region-eastus2',
              version: '2024-12-01-preview',
              models: {
                'o1-mini': {
                  deploymentName: 'o1-mini',
                },
              },
            },
            'codex-mini': {
              apiKey: '${AZURE_API_KEY}',
              baseURL: 'https://example.cognitiveservices.azure.com/openai/',
              version: '2025-04-01-preview',
              serverless: true,
              models: {
                'codex-mini': {
                  deploymentName: 'codex-mini',
                },
              },
            },
          },
        };
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'o1-mini';

        const text = 'Test Azure multi-group conversation';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify correct model and provider are used
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: Providers.AZURE,
            titleMethod: 'completion',
          }),
        );

        const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
        expect(generateTitleCall.clientOptions.model).toBe('o1-mini');
        expect(generateTitleCall.clientOptions.maxTokens).toBeUndefined(); // o1 models shouldn't have maxTokens
      });

      it('should use all config as fallback for Azure endpoints', async () => {
        // Set up Azure endpoint with minimal config
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'gpt-4';

        // Remove Azure-specific config
        delete mockReq.app.locals[EModelEndpoint.azureOpenAI];

        // Set 'all' config as fallback with a serverless Azure config
        mockReq.app.locals.all = {
          titleConvo: true,
          titleModel: 'gpt-4',
          titleMethod: 'structured',
          titlePrompt: 'Fallback title prompt from all config',
          titlePromptTemplate: 'Template: {{content}}',
          modelGroupMap: {
            'gpt-4': {
              group: 'default-group',
              deploymentName: 'gpt-4',
            },
          },
          groupMap: {
            'default-group': {
              apiKey: '${AZURE_API_KEY}',
              baseURL: 'https://default.openai.azure.com/',
              version: '2024-02-15-preview',
              serverless: true,
              models: {
                'gpt-4': {
                  deploymentName: 'gpt-4',
                },
              },
            },
          },
        };

        const text = 'Test Azure with all config fallback';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify all config is used
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: Providers.OPENAI, // Should be OPENAI when no instanceName
            titleMethod: 'structured',
            titlePrompt: 'Fallback title prompt from all config',
            titlePromptTemplate: 'Template: {{content}}',
          }),
        );
      });
    });
  });
});
