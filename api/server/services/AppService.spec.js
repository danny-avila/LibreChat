const {
  FileSources,
  EModelEndpoint,
  EImageOutputType,
  AgentCapabilities,
  defaultSocialLogins,
  validateAzureGroups,
  defaultAgentCapabilities,
  deprecatedAzureVariables,
  conflictingAzureVariables,
} = require('librechat-data-provider');

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const AppService = require('./AppService');

jest.mock('./Files/Firebase/initialize', () => ({
  initializeFirebase: jest.fn(),
}));

jest.mock('./Config/loadCustomConfig', () =>
  jest.fn(() =>
    Promise.resolve({
      registration: { socialLogins: ['testLogin'] },
      fileStrategy: 'testStrategy',
      balance: {
        enabled: true,
      },
    }),
  ),
);

jest.mock('./start/tools', () => ({
  loadAndFormatTools: jest.fn().mockReturnValue({
    ExampleTool: {
      type: 'function',
      function: {
        description: 'Example tool function',
        name: 'exampleFunction',
        parameters: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'An example parameter' },
          },
          required: ['param1'],
        },
      },
    },
  }),
}));
jest.mock('./start/turnstile', () => ({
  loadTurnstileConfig: jest.fn(() => ({
    siteKey: 'default-site-key',
    options: {},
  })),
}));

const azureGroups = [
  {
    group: 'librechat-westus',
    apiKey: '${WESTUS_API_KEY}',
    instanceName: 'librechat-westus',
    version: '2023-12-01-preview',
    models: {
      'gpt-4-vision-preview': {
        deploymentName: 'gpt-4-vision-preview',
        version: '2024-02-15-preview',
      },
      'gpt-3.5-turbo': {
        deploymentName: 'gpt-35-turbo',
      },
      'gpt-3.5-turbo-1106': {
        deploymentName: 'gpt-35-turbo-1106',
      },
      'gpt-4': {
        deploymentName: 'gpt-4',
      },
      'gpt-4-1106-preview': {
        deploymentName: 'gpt-4-1106-preview',
      },
    },
  },
  {
    group: 'librechat-eastus',
    apiKey: '${EASTUS_API_KEY}',
    instanceName: 'librechat-eastus',
    deploymentName: 'gpt-4-turbo',
    version: '2024-02-15-preview',
    models: {
      'gpt-4-turbo': true,
    },
  },
];

jest.mock('./start/checks', () => ({
  ...jest.requireActual('./start/checks'),
  checkHealth: jest.fn(),
}));

describe('AppService', () => {
  const mockedTurnstileConfig = {
    siteKey: 'default-site-key',
    options: {},
  };
  const loadCustomConfig = require('./Config/loadCustomConfig');

  beforeEach(() => {
    process.env.CDN_PROVIDER = undefined;
    jest.clearAllMocks();
  });

  it('should correctly assign process.env and initialize app config based on custom config', async () => {
    const result = await AppService();

    expect(process.env.CDN_PROVIDER).toEqual('testStrategy');

    expect(result).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          fileStrategy: 'testStrategy',
        }),
        registration: expect.objectContaining({
          socialLogins: ['testLogin'],
        }),
        fileStrategy: 'testStrategy',
        interfaceConfig: expect.objectContaining({
          endpointsMenu: true,
          modelSelect: true,
          parameters: true,
          sidePanel: true,
          presets: true,
        }),
        mcpConfig: null,
        turnstileConfig: mockedTurnstileConfig,
        modelSpecs: undefined,
        paths: expect.anything(),
        ocr: expect.anything(),
        imageOutputType: expect.any(String),
        fileConfig: undefined,
        secureImageLinks: undefined,
        balance: { enabled: true },
        filteredTools: undefined,
        includedTools: undefined,
        webSearch: expect.objectContaining({
          safeSearch: 1,
          jinaApiKey: '${JINA_API_KEY}',
          cohereApiKey: '${COHERE_API_KEY}',
          serperApiKey: '${SERPER_API_KEY}',
          searxngApiKey: '${SEARXNG_API_KEY}',
          firecrawlApiKey: '${FIRECRAWL_API_KEY}',
          firecrawlApiUrl: '${FIRECRAWL_API_URL}',
          searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        }),
        memory: undefined,
        endpoints: expect.objectContaining({
          agents: expect.objectContaining({
            disableBuilder: false,
            capabilities: expect.arrayContaining([...defaultAgentCapabilities]),
            maxCitations: 30,
            maxCitationsPerFile: 7,
            minRelevanceScore: 0.45,
          }),
        }),
      }),
    );
  });

  it('should log a warning if the config version is outdated', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        version: '0.9.0', // An outdated version for this test
        registration: { socialLogins: ['testLogin'] },
        fileStrategy: 'testStrategy',
      }),
    );

    await AppService();

    const { logger } = require('@librechat/data-schemas');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Outdated Config version'));
  });

  it('should change the `imageOutputType` based on config value', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        version: '0.10.0',
        imageOutputType: EImageOutputType.WEBP,
      }),
    );

    const result = await AppService();
    expect(result).toEqual(
      expect.objectContaining({
        imageOutputType: EImageOutputType.WEBP,
      }),
    );
  });

  it('should default to `PNG` `imageOutputType` with no provided type', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        version: '0.10.0',
      }),
    );

    const result = await AppService();
    expect(result).toEqual(
      expect.objectContaining({
        imageOutputType: EImageOutputType.PNG,
      }),
    );
  });

  it('should default to `PNG` `imageOutputType` with no provided config', async () => {
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(undefined));

    const result = await AppService();
    expect(result).toEqual(
      expect.objectContaining({
        imageOutputType: EImageOutputType.PNG,
      }),
    );
  });

  it('should initialize Firebase when fileStrategy is firebase', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        fileStrategy: FileSources.firebase,
      }),
    );

    await AppService();

    const { initializeFirebase } = require('./Files/Firebase/initialize');
    expect(initializeFirebase).toHaveBeenCalled();

    expect(process.env.CDN_PROVIDER).toEqual(FileSources.firebase);
  });

  it('should load and format tools accurately with defined structure', async () => {
    const { loadAndFormatTools } = require('./start/tools');

    const result = await AppService();

    expect(loadAndFormatTools).toHaveBeenCalledWith({
      adminFilter: undefined,
      adminIncluded: undefined,
      directory: expect.anything(),
    });

    // Verify tools are included in the returned config
    expect(result.availableTools).toBeDefined();
    expect(result.availableTools.ExampleTool).toEqual({
      type: 'function',
      function: {
        description: 'Example tool function',
        name: 'exampleFunction',
        parameters: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'An example parameter' },
          },
          required: ['param1'],
        },
      },
    });
  });

  it('should correctly configure Assistants endpoint based on custom config', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.assistants]: {
            disableBuilder: true,
            pollIntervalMs: 5000,
            timeoutMs: 30000,
            supportedIds: ['id1', 'id2'],
            privateAssistants: false,
          },
        },
      }),
    );

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          [EModelEndpoint.assistants]: expect.objectContaining({
            disableBuilder: true,
            pollIntervalMs: 5000,
            timeoutMs: 30000,
            supportedIds: expect.arrayContaining(['id1', 'id2']),
            privateAssistants: false,
          }),
        }),
      }),
    );
  });

  it('should correctly configure Agents endpoint based on custom config', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.agents]: {
            disableBuilder: true,
            recursionLimit: 10,
            maxRecursionLimit: 20,
            allowedProviders: ['openai', 'anthropic'],
            capabilities: [AgentCapabilities.tools, AgentCapabilities.actions],
          },
        },
      }),
    );

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          [EModelEndpoint.agents]: expect.objectContaining({
            disableBuilder: true,
            recursionLimit: 10,
            maxRecursionLimit: 20,
            allowedProviders: expect.arrayContaining(['openai', 'anthropic']),
            capabilities: expect.arrayContaining([
              AgentCapabilities.tools,
              AgentCapabilities.actions,
            ]),
          }),
        }),
      }),
    );
  });

  it('should configure Agents endpoint with defaults when no config is provided', async () => {
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve({}));

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          [EModelEndpoint.agents]: expect.objectContaining({
            disableBuilder: false,
            capabilities: expect.arrayContaining([...defaultAgentCapabilities]),
          }),
        }),
      }),
    );
  });

  it('should configure Agents endpoint with defaults when endpoints exist but agents is not defined', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.openAI]: {
            titleConvo: true,
          },
        },
      }),
    );

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          [EModelEndpoint.agents]: expect.objectContaining({
            disableBuilder: false,
            capabilities: expect.arrayContaining([...defaultAgentCapabilities]),
          }),
          [EModelEndpoint.openAI]: expect.objectContaining({
            titleConvo: true,
          }),
        }),
      }),
    );
  });

  it('should correctly configure minimum Azure OpenAI Assistant values', async () => {
    const assistantGroups = [azureGroups[0], { ...azureGroups[1], assistants: true }];
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {
            groups: assistantGroups,
            assistants: true,
          },
        },
      }),
    );

    process.env.WESTUS_API_KEY = 'westus-key';
    process.env.EASTUS_API_KEY = 'eastus-key';

    const result = await AppService();
    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          [EModelEndpoint.azureAssistants]: expect.objectContaining({
            capabilities: expect.arrayContaining([
              expect.any(String),
              expect.any(String),
              expect.any(String),
            ]),
          }),
        }),
      }),
    );
  });

  it('should correctly configure Azure OpenAI endpoint based on custom config', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {
            groups: azureGroups,
          },
        },
      }),
    );

    process.env.WESTUS_API_KEY = 'westus-key';
    process.env.EASTUS_API_KEY = 'eastus-key';

    const result = await AppService();

    const { modelNames, modelGroupMap, groupMap } = validateAzureGroups(azureGroups);
    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          [EModelEndpoint.azureOpenAI]: expect.objectContaining({
            modelNames,
            modelGroupMap,
            groupMap,
          }),
        }),
      }),
    );
  });

  it('should not modify FILE_UPLOAD environment variables without rate limits', async () => {
    // Setup initial environment variables
    process.env.FILE_UPLOAD_IP_MAX = '10';
    process.env.FILE_UPLOAD_IP_WINDOW = '15';
    process.env.FILE_UPLOAD_USER_MAX = '5';
    process.env.FILE_UPLOAD_USER_WINDOW = '20';

    const initialEnv = { ...process.env };

    await AppService();

    // Expect environment variables to remain unchanged
    expect(process.env.FILE_UPLOAD_IP_MAX).toEqual(initialEnv.FILE_UPLOAD_IP_MAX);
    expect(process.env.FILE_UPLOAD_IP_WINDOW).toEqual(initialEnv.FILE_UPLOAD_IP_WINDOW);
    expect(process.env.FILE_UPLOAD_USER_MAX).toEqual(initialEnv.FILE_UPLOAD_USER_MAX);
    expect(process.env.FILE_UPLOAD_USER_WINDOW).toEqual(initialEnv.FILE_UPLOAD_USER_WINDOW);
  });

  it('should correctly set FILE_UPLOAD environment variables based on rate limits', async () => {
    // Define and mock a custom configuration with rate limits
    const rateLimitsConfig = {
      rateLimits: {
        fileUploads: {
          ipMax: '100',
          ipWindowInMinutes: '60',
          userMax: '50',
          userWindowInMinutes: '30',
        },
      },
    };

    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(rateLimitsConfig));

    await AppService();

    // Verify that process.env has been updated according to the rate limits config
    expect(process.env.FILE_UPLOAD_IP_MAX).toEqual('100');
    expect(process.env.FILE_UPLOAD_IP_WINDOW).toEqual('60');
    expect(process.env.FILE_UPLOAD_USER_MAX).toEqual('50');
    expect(process.env.FILE_UPLOAD_USER_WINDOW).toEqual('30');
  });

  it('should fallback to default FILE_UPLOAD environment variables when rate limits are unspecified', async () => {
    // Setup initial environment variables to non-default values
    process.env.FILE_UPLOAD_IP_MAX = 'initialMax';
    process.env.FILE_UPLOAD_IP_WINDOW = 'initialWindow';
    process.env.FILE_UPLOAD_USER_MAX = 'initialUserMax';
    process.env.FILE_UPLOAD_USER_WINDOW = 'initialUserWindow';

    await AppService();

    // Verify that process.env falls back to the initial values
    expect(process.env.FILE_UPLOAD_IP_MAX).toEqual('initialMax');
    expect(process.env.FILE_UPLOAD_IP_WINDOW).toEqual('initialWindow');
    expect(process.env.FILE_UPLOAD_USER_MAX).toEqual('initialUserMax');
    expect(process.env.FILE_UPLOAD_USER_WINDOW).toEqual('initialUserWindow');
  });

  it('should not modify IMPORT environment variables without rate limits', async () => {
    // Setup initial environment variables
    process.env.IMPORT_IP_MAX = '10';
    process.env.IMPORT_IP_WINDOW = '15';
    process.env.IMPORT_USER_MAX = '5';
    process.env.IMPORT_USER_WINDOW = '20';

    const initialEnv = { ...process.env };

    await AppService();

    // Expect environment variables to remain unchanged
    expect(process.env.IMPORT_IP_MAX).toEqual(initialEnv.IMPORT_IP_MAX);
    expect(process.env.IMPORT_IP_WINDOW).toEqual(initialEnv.IMPORT_IP_WINDOW);
    expect(process.env.IMPORT_USER_MAX).toEqual(initialEnv.IMPORT_USER_MAX);
    expect(process.env.IMPORT_USER_WINDOW).toEqual(initialEnv.IMPORT_USER_WINDOW);
  });

  it('should correctly set IMPORT environment variables based on rate limits', async () => {
    // Define and mock a custom configuration with rate limits
    const importLimitsConfig = {
      rateLimits: {
        conversationsImport: {
          ipMax: '150',
          ipWindowInMinutes: '60',
          userMax: '50',
          userWindowInMinutes: '30',
        },
      },
    };

    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(importLimitsConfig));

    await AppService();

    // Verify that process.env has been updated according to the rate limits config
    expect(process.env.IMPORT_IP_MAX).toEqual('150');
    expect(process.env.IMPORT_IP_WINDOW).toEqual('60');
    expect(process.env.IMPORT_USER_MAX).toEqual('50');
    expect(process.env.IMPORT_USER_WINDOW).toEqual('30');
  });

  it('should fallback to default IMPORT environment variables when rate limits are unspecified', async () => {
    // Setup initial environment variables to non-default values
    process.env.IMPORT_IP_MAX = 'initialMax';
    process.env.IMPORT_IP_WINDOW = 'initialWindow';
    process.env.IMPORT_USER_MAX = 'initialUserMax';
    process.env.IMPORT_USER_WINDOW = 'initialUserWindow';

    await AppService();

    // Verify that process.env falls back to the initial values
    expect(process.env.IMPORT_IP_MAX).toEqual('initialMax');
    expect(process.env.IMPORT_IP_WINDOW).toEqual('initialWindow');
    expect(process.env.IMPORT_USER_MAX).toEqual('initialUserMax');
    expect(process.env.IMPORT_USER_WINDOW).toEqual('initialUserWindow');
  });

  it('should correctly configure endpoint with titlePrompt, titleMethod, and titlePromptTemplate', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.openAI]: {
            titleConvo: true,
            titleModel: 'gpt-3.5-turbo',
            titleMethod: 'structured',
            titlePrompt: 'Custom title prompt for conversation',
            titlePromptTemplate: 'Summarize this conversation: {{conversation}}',
          },
          [EModelEndpoint.assistants]: {
            titleMethod: 'functions',
            titlePrompt: 'Generate a title for this assistant conversation',
            titlePromptTemplate: 'Assistant conversation template: {{messages}}',
          },
          [EModelEndpoint.azureOpenAI]: {
            groups: azureGroups,
            titleConvo: true,
            titleMethod: 'completion',
            titleModel: 'gpt-4',
            titlePrompt: 'Azure title prompt',
            titlePromptTemplate: 'Azure conversation: {{context}}',
          },
        },
      }),
    );

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          // Check OpenAI endpoint configuration
          [EModelEndpoint.openAI]: expect.objectContaining({
            titleConvo: true,
            titleModel: 'gpt-3.5-turbo',
            titleMethod: 'structured',
            titlePrompt: 'Custom title prompt for conversation',
            titlePromptTemplate: 'Summarize this conversation: {{conversation}}',
          }),
          // Check Assistants endpoint configuration
          [EModelEndpoint.assistants]: expect.objectContaining({
            titleMethod: 'functions',
            titlePrompt: 'Generate a title for this assistant conversation',
            titlePromptTemplate: 'Assistant conversation template: {{messages}}',
          }),
          // Check Azure OpenAI endpoint configuration
          [EModelEndpoint.azureOpenAI]: expect.objectContaining({
            titleConvo: true,
            titleMethod: 'completion',
            titleModel: 'gpt-4',
            titlePrompt: 'Azure title prompt',
            titlePromptTemplate: 'Azure conversation: {{context}}',
          }),
        }),
      }),
    );
  });

  it('should configure Agent endpoint with title generation settings', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.agents]: {
            disableBuilder: false,
            titleConvo: true,
            titleModel: 'gpt-4',
            titleMethod: 'structured',
            titlePrompt: 'Generate a descriptive title for this agent conversation',
            titlePromptTemplate: 'Agent conversation summary: {{content}}',
            recursionLimit: 15,
            capabilities: [AgentCapabilities.tools, AgentCapabilities.actions],
          },
        },
      }),
    );

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          [EModelEndpoint.agents]: expect.objectContaining({
            disableBuilder: false,
            titleConvo: true,
            titleModel: 'gpt-4',
            titleMethod: 'structured',
            titlePrompt: 'Generate a descriptive title for this agent conversation',
            titlePromptTemplate: 'Agent conversation summary: {{content}}',
            recursionLimit: 15,
            capabilities: expect.arrayContaining([
              AgentCapabilities.tools,
              AgentCapabilities.actions,
            ]),
          }),
        }),
      }),
    );
  });

  it('should handle missing title configuration options with defaults', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.openAI]: {
            titleConvo: true,
            // titlePrompt and titlePromptTemplate are not provided
          },
        },
      }),
    );

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          [EModelEndpoint.openAI]: expect.objectContaining({
            titleConvo: true,
          }),
        }),
      }),
    );

    // Verify that optional fields are not set when not provided
    expect(result.endpoints[EModelEndpoint.openAI].titlePrompt).toBeUndefined();
    expect(result.endpoints[EModelEndpoint.openAI].titlePromptTemplate).toBeUndefined();
    expect(result.endpoints[EModelEndpoint.openAI].titleMethod).toBeUndefined();
  });

  it('should correctly configure titleEndpoint when specified', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.openAI]: {
            titleConvo: true,
            titleModel: 'gpt-3.5-turbo',
            titleEndpoint: EModelEndpoint.anthropic,
            titlePrompt: 'Generate a concise title',
          },
          [EModelEndpoint.agents]: {
            titleEndpoint: 'custom-provider',
            titleMethod: 'structured',
          },
        },
      }),
    );

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          // Check OpenAI endpoint has titleEndpoint
          [EModelEndpoint.openAI]: expect.objectContaining({
            titleConvo: true,
            titleModel: 'gpt-3.5-turbo',
            titleEndpoint: EModelEndpoint.anthropic,
            titlePrompt: 'Generate a concise title',
          }),
          // Check Agents endpoint has titleEndpoint
          [EModelEndpoint.agents]: expect.objectContaining({
            titleEndpoint: 'custom-provider',
            titleMethod: 'structured',
          }),
        }),
      }),
    );
  });

  it('should correctly configure all endpoint when specified', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          all: {
            titleConvo: true,
            titleModel: 'gpt-4o-mini',
            titleMethod: 'structured',
            titlePrompt: 'Default title prompt for all endpoints',
            titlePromptTemplate: 'Default template: {{conversation}}',
            titleEndpoint: EModelEndpoint.anthropic,
            streamRate: 50,
          },
          [EModelEndpoint.openAI]: {
            titleConvo: true,
            titleModel: 'gpt-3.5-turbo',
          },
        },
      }),
    );

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        // Check that 'all' endpoint config is loaded
        endpoints: expect.objectContaining({
          all: expect.objectContaining({
            titleConvo: true,
            titleModel: 'gpt-4o-mini',
            titleMethod: 'structured',
            titlePrompt: 'Default title prompt for all endpoints',
            titlePromptTemplate: 'Default template: {{conversation}}',
            titleEndpoint: EModelEndpoint.anthropic,
            streamRate: 50,
          }),
          // Check that OpenAI endpoint has its own config
          [EModelEndpoint.openAI]: expect.objectContaining({
            titleConvo: true,
            titleModel: 'gpt-3.5-turbo',
          }),
        }),
      }),
    );
  });
});

describe('AppService updating app config and issuing warnings', () => {
  let initialEnv;
  const loadCustomConfig = require('./Config/loadCustomConfig');

  beforeEach(() => {
    // Store initial environment variables to restore them after each test
    initialEnv = { ...process.env };

    process.env.CDN_PROVIDER = undefined;
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore initial environment variables
    process.env = { ...initialEnv };
  });

  it('should initialize app config with default values if loadCustomConfig returns undefined', async () => {
    // Mock loadCustomConfig to return undefined
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(undefined));

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        paths: expect.anything(),
        config: {},
        fileStrategy: FileSources.local,
        registration: expect.objectContaining({
          socialLogins: defaultSocialLogins,
        }),
        balance: expect.objectContaining({
          enabled: false,
          startBalance: undefined,
        }),
      }),
    );
  });

  it('should initialize app config with values from loadCustomConfig', async () => {
    // Mock loadCustomConfig to return a specific config object with a complete balance config
    const customConfig = {
      fileStrategy: 'firebase',
      registration: { socialLogins: ['testLogin'] },
      balance: {
        enabled: false,
        startBalance: 5000,
        autoRefillEnabled: true,
        refillIntervalValue: 15,
        refillIntervalUnit: 'hours',
        refillAmount: 5000,
      },
    };
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(customConfig));

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        paths: expect.anything(),
        config: customConfig,
        fileStrategy: customConfig.fileStrategy,
        registration: expect.objectContaining({
          socialLogins: customConfig.registration.socialLogins,
        }),
        balance: customConfig.balance,
      }),
    );
  });

  it('should apply the assistants endpoint configuration correctly to app config', async () => {
    const mockConfig = {
      endpoints: {
        assistants: {
          disableBuilder: true,
          pollIntervalMs: 5000,
          timeoutMs: 30000,
          supportedIds: ['id1', 'id2'],
        },
      },
    };
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(mockConfig));

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        endpoints: expect.objectContaining({
          assistants: expect.objectContaining({
            disableBuilder: true,
            pollIntervalMs: 5000,
            timeoutMs: 30000,
            supportedIds: ['id1', 'id2'],
          }),
        }),
      }),
    );

    // Verify excludedIds is undefined when not provided
    expect(result.endpoints.assistants.excludedIds).toBeUndefined();
  });

  it('should log a warning when both supportedIds and excludedIds are provided', async () => {
    const mockConfig = {
      endpoints: {
        assistants: {
          disableBuilder: false,
          pollIntervalMs: 3000,
          timeoutMs: 20000,
          supportedIds: ['id1', 'id2'],
          excludedIds: ['id3'],
        },
      },
    };
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(mockConfig));

    await AppService();

    const { logger } = require('@librechat/data-schemas');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "The 'assistants' endpoint has both 'supportedIds' and 'excludedIds' defined.",
      ),
    );
  });

  it('should log a warning when privateAssistants and supportedIds or excludedIds are provided', async () => {
    const mockConfig = {
      endpoints: {
        assistants: {
          privateAssistants: true,
          supportedIds: ['id1'],
        },
      },
    };
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(mockConfig));

    await AppService();

    const { logger } = require('@librechat/data-schemas');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "The 'assistants' endpoint has both 'privateAssistants' and 'supportedIds' or 'excludedIds' defined.",
      ),
    );
  });

  it('should issue expected warnings when loading Azure Groups with deprecated Environment Variables', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {
            groups: azureGroups,
          },
        },
      }),
    );

    deprecatedAzureVariables.forEach((varInfo) => {
      process.env[varInfo.key] = 'test';
    });

    await AppService();

    const { logger } = require('@librechat/data-schemas');
    deprecatedAzureVariables.forEach(({ key, description }) => {
      expect(logger.warn).toHaveBeenCalledWith(
        `The \`${key}\` environment variable (related to ${description}) should not be used in combination with the \`azureOpenAI\` endpoint configuration, as you will experience conflicts and errors.`,
      );
    });
  });

  it('should issue expected warnings when loading conflicting Azure Envrionment Variables', async () => {
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {
            groups: azureGroups,
          },
        },
      }),
    );

    conflictingAzureVariables.forEach((varInfo) => {
      process.env[varInfo.key] = 'test';
    });

    await AppService();

    const { logger } = require('@librechat/data-schemas');
    conflictingAzureVariables.forEach(({ key }) => {
      expect(logger.warn).toHaveBeenCalledWith(
        `The \`${key}\` environment variable should not be used in combination with the \`azureOpenAI\` endpoint configuration, as you may experience with the defined placeholders for mapping to the current model grouping using the same name.`,
      );
    });
  });

  it('should not parse environment variable references in OCR config', async () => {
    // Mock custom configuration with env variable references in OCR config
    const mockConfig = {
      ocr: {
        apiKey: '${OCR_API_KEY_CUSTOM_VAR_NAME}',
        baseURL: '${OCR_BASEURL_CUSTOM_VAR_NAME}',
        strategy: 'mistral_ocr',
        mistralModel: 'mistral-medium',
      },
    };

    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(mockConfig));

    // Set actual environment variables with different values
    process.env.OCR_API_KEY_CUSTOM_VAR_NAME = 'actual-api-key';
    process.env.OCR_BASEURL_CUSTOM_VAR_NAME = 'https://actual-ocr-url.com';

    const result = await AppService();

    // Verify that the raw string references were preserved and not interpolated
    expect(result).toEqual(
      expect.objectContaining({
        ocr: expect.objectContaining({
          apiKey: '${OCR_API_KEY_CUSTOM_VAR_NAME}',
          baseURL: '${OCR_BASEURL_CUSTOM_VAR_NAME}',
          strategy: 'mistral_ocr',
          mistralModel: 'mistral-medium',
        }),
      }),
    );
  });

  it('should correctly configure peoplePicker permissions when specified', async () => {
    const mockConfig = {
      interface: {
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
      },
    };

    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(mockConfig));

    const result = await AppService();

    // Check that interface config includes the permissions
    expect(result).toEqual(
      expect.objectContaining({
        interfaceConfig: expect.objectContaining({
          peoplePicker: expect.objectContaining({
            users: true,
            groups: true,
            roles: true,
          }),
        }),
      }),
    );
  });
});
