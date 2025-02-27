const {
  FileSources,
  EModelEndpoint,
  EImageOutputType,
  defaultSocialLogins,
  validateAzureGroups,
  deprecatedAzureVariables,
  conflictingAzureVariables,
  getConfigDefaults,
  removeNullishValues,
} = require('librechat-data-provider');
const AppService = require('./AppService');

jest.mock('./Config/loadCustomConfig', () => {
  return jest.fn(() =>
    Promise.resolve({
      registration: { socialLogins: ['testLogin'] },
      fileStrategy: 'testStrategy',
    }),
  );
});
jest.mock('./start/checks', () => ({
  checkVariables: jest.fn(),
  checkHealth: jest.fn().mockResolvedValue(),
  checkConfig: jest.fn(),
  checkAzureVariables: jest.fn(),
}));
jest.mock('./start/assistants', () => ({
  azureAssistantsDefaults: jest.fn(() => ({ assistantsDefault: true })),
  assistantsConfigSetup: jest.fn((config, endpoint, prev) => ({
    disableBuilder: config.endpoints[endpoint]?.disableBuilder || false,
    pollIntervalMs: config.endpoints[endpoint]?.pollIntervalMs,
    timeoutMs: config.endpoints[endpoint]?.timeoutMs,
    supportedIds: config.endpoints[endpoint]?.supportedIds,
    privateAssistants: config.endpoints[endpoint]?.privateAssistants,
  })),
}));
jest.mock('./Files/Firebase/initialize', () => ({
  initializeFirebase: jest.fn(),
}));
jest.mock('~/models/Role', () => ({
  initializeRoles: jest.fn(),
}));
jest.mock('./ToolService', () => ({
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
jest.mock('./start/interface', () => ({
  loadDefaultInterface: jest.fn(() => ({
    endpointsMenu: true,
    modelSelect: true,
    parameters: true,
    sidePanel: true,
    presets: true,
  })),
}));
jest.mock('./start/turnstile', () => ({
  loadTurnstileConfig: jest.fn(() => ({
    siteKey: 'default-site-key',
    options: {},
  })),
}));
jest.mock('./start/azureOpenAI', () => ({
  azureConfigSetup: jest.fn(() => ({ azure: true })),
}));
jest.mock('./start/modelSpecs', () => ({
  processModelSpecs: jest.fn(() => undefined),
}));
jest.mock('./start/agents', () => ({
  agentsConfigSetup: jest.fn(() => ({ agent: true })),
}));
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
  getMCPManager: jest.fn(() => ({
    initializeMCP: jest.fn(),
    mapAvailableTools: jest.fn(),
  })),
}));
jest.mock('~/config/paths', () => ({
  structuredTools: '/some/path',
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

describe('AppService', () => {
  let app;
  const mockedInterfaceConfig = {
    endpointsMenu: true,
    modelSelect: true,
    parameters: true,
    sidePanel: true,
    presets: true,
  };
  const mockedTurnstileConfig = {
    siteKey: 'default-site-key',
    options: {},
  };

  beforeEach(() => {
    app = { locals: {} };
    process.env = {}; // reset env
  });

  it('should correctly assign process.env and app.locals based on custom config', async () => {
    await AppService(app);

    expect(process.env.CDN_PROVIDER).toEqual('testStrategy');

    expect(app.locals).toEqual({
      paths: expect.any(Object),
      fileStrategy: 'testStrategy',
      socialLogins: ['testLogin'],
      filteredTools: undefined,
      includedTools: undefined,
      availableTools: {
        ExampleTool: {
          type: 'function',
          function: expect.objectContaining({
            description: 'Example tool function',
            name: 'exampleFunction',
            parameters: expect.objectContaining({
              type: 'object',
              properties: expect.any(Object),
              required: ['param1'],
            }),
          }),
        },
      },
      imageOutputType: 'png',
      interfaceConfig: mockedInterfaceConfig,
      turnstileConfig: mockedTurnstileConfig,
      fileConfig: undefined,
      secureImageLinks: undefined,
      modelSpecs: undefined,
    });
  });

  it('should change the `imageOutputType` based on config value', async () => {
    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        version: '0.10.0',
        imageOutputType: EImageOutputType.WEBP,
      }),
    );

    await AppService(app);
    expect(app.locals.imageOutputType).toEqual(EImageOutputType.WEBP);
  });

  it('should default to `png` `imageOutputType` with no provided type', async () => {
    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        version: '0.10.0',
      }),
    );

    await AppService(app);
    expect(app.locals.imageOutputType).toEqual('png');
  });

  it('should default to `png` `imageOutputType` with no provided config', async () => {
    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(undefined));

    await AppService(app);
    expect(app.locals.imageOutputType).toEqual('png');
  });

  it('should initialize Firebase when fileStrategy is firebase', async () => {
    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() =>
      Promise.resolve({
        fileStrategy: FileSources.firebase,
      }),
    );

    await AppService(app);

    const { initializeFirebase } = require('./Files/Firebase/initialize');
    expect(initializeFirebase).toHaveBeenCalled();

    expect(process.env.CDN_PROVIDER).toEqual(FileSources.firebase);
  });

  it('should load and format tools accurately with defined structure', async () => {
    const { loadAndFormatTools } = require('./ToolService');
    await AppService(app);

    expect(loadAndFormatTools).toHaveBeenCalledWith({
      adminFilter: undefined,
      adminIncluded: undefined,
      directory: '/some/path',
    });

    expect(app.locals.availableTools.ExampleTool).toBeDefined();
    expect(app.locals.availableTools.ExampleTool).toEqual({
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
    const loadCustomConfig = require('./Config/loadCustomConfig');
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

    await AppService(app);

    expect(app.locals).toHaveProperty(EModelEndpoint.assistants);
    expect(app.locals[EModelEndpoint.assistants]).toEqual({
      disableBuilder: true,
      pollIntervalMs: 5000,
      timeoutMs: 30000,
      supportedIds: ['id1', 'id2'],
      privateAssistants: false,
    });
  });

  it('should correctly configure minimum Azure OpenAI Assistant values', async () => {
    const assistantGroups = [azureGroups[0], { ...azureGroups[1], assistants: true }];
    const loadCustomConfig = require('./Config/loadCustomConfig');
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

    await AppService(app);
    expect(app.locals).toHaveProperty(EModelEndpoint.azureAssistants);
    // Expecting the azureAssistantsDefaults mock to have been used
    expect(app.locals[EModelEndpoint.azureAssistants]).toEqual({ assistantsDefault: true });
  });

  it('should correctly configure Azure OpenAI endpoint based on custom config', async () => {
    const loadCustomConfig = require('./Config/loadCustomConfig');
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

    await AppService(app);

    expect(app.locals).toHaveProperty(EModelEndpoint.azureOpenAI);
    const azureConfig = app.locals[EModelEndpoint.azureOpenAI];
    expect(azureConfig).toEqual({ azure: true });
  });

  it('should not modify FILE_UPLOAD environment variables without rate limits', async () => {
    process.env.FILE_UPLOAD_IP_MAX = '10';
    process.env.FILE_UPLOAD_IP_WINDOW = '15';
    process.env.FILE_UPLOAD_USER_MAX = '5';
    process.env.FILE_UPLOAD_USER_WINDOW = '20';

    const initialEnv = { ...process.env };

    await AppService(app);

    expect(process.env.FILE_UPLOAD_IP_MAX).toEqual(initialEnv.FILE_UPLOAD_IP_MAX);
    expect(process.env.FILE_UPLOAD_IP_WINDOW).toEqual(initialEnv.FILE_UPLOAD_IP_WINDOW);
    expect(process.env.FILE_UPLOAD_USER_MAX).toEqual(initialEnv.FILE_UPLOAD_USER_MAX);
    expect(process.env.FILE_UPLOAD_USER_WINDOW).toEqual(initialEnv.FILE_UPLOAD_USER_WINDOW);
  });

  it('should correctly set FILE_UPLOAD environment variables based on rate limits', async () => {
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

    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(rateLimitsConfig));

    await AppService(app);

    expect(process.env.FILE_UPLOAD_IP_MAX).toEqual('100');
    expect(process.env.FILE_UPLOAD_IP_WINDOW).toEqual('60');
    expect(process.env.FILE_UPLOAD_USER_MAX).toEqual('50');
    expect(process.env.FILE_UPLOAD_USER_WINDOW).toEqual('30');
  });

  it('should fallback to default FILE_UPLOAD environment variables when rate limits are unspecified', async () => {
    process.env.FILE_UPLOAD_IP_MAX = 'initialMax';
    process.env.FILE_UPLOAD_IP_WINDOW = 'initialWindow';
    process.env.FILE_UPLOAD_USER_MAX = 'initialUserMax';
    process.env.FILE_UPLOAD_USER_WINDOW = 'initialUserWindow';

    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve({}));

    await AppService(app);

    expect(process.env.FILE_UPLOAD_IP_MAX).toEqual('initialMax');
    expect(process.env.FILE_UPLOAD_IP_WINDOW).toEqual('initialWindow');
    expect(process.env.FILE_UPLOAD_USER_MAX).toEqual('initialUserMax');
    expect(process.env.FILE_UPLOAD_USER_WINDOW).toEqual('initialUserWindow');
  });

  it('should not modify IMPORT environment variables without rate limits', async () => {
    process.env.IMPORT_IP_MAX = '10';
    process.env.IMPORT_IP_WINDOW = '15';
    process.env.IMPORT_USER_MAX = '5';
    process.env.IMPORT_USER_WINDOW = '20';

    const initialEnv = { ...process.env };

    await AppService(app);

    expect(process.env.IMPORT_IP_MAX).toEqual(initialEnv.IMPORT_IP_MAX);
    expect(process.env.IMPORT_IP_WINDOW).toEqual(initialEnv.IMPORT_IP_WINDOW);
    expect(process.env.IMPORT_USER_MAX).toEqual(initialEnv.IMPORT_USER_MAX);
    expect(process.env.IMPORT_USER_WINDOW).toEqual(initialEnv.IMPORT_USER_WINDOW);
  });

  it('should correctly set IMPORT environment variables based on rate limits', async () => {
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

    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(importLimitsConfig));

    await AppService(app);

    expect(process.env.IMPORT_IP_MAX).toEqual('150');
    expect(process.env.IMPORT_IP_WINDOW).toEqual('60');
    expect(process.env.IMPORT_USER_MAX).toEqual('50');
    expect(process.env.IMPORT_USER_WINDOW).toEqual('30');
  });

  it('should fallback to default IMPORT environment variables when rate limits are unspecified', async () => {
    process.env.IMPORT_IP_MAX = 'initialMax';
    process.env.IMPORT_IP_WINDOW = 'initialWindow';
    process.env.IMPORT_USER_MAX = 'initialUserMax';
    process.env.IMPORT_USER_WINDOW = 'initialUserWindow';

    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve({}));

    await AppService(app);

    expect(process.env.IMPORT_IP_MAX).toEqual('initialMax');
    expect(process.env.IMPORT_IP_WINDOW).toEqual('initialWindow');
    expect(process.env.IMPORT_USER_MAX).toEqual('initialUserMax');
    expect(process.env.IMPORT_USER_WINDOW).toEqual('initialUserWindow');
  });
});

describe('AppService updating app.locals and issuing warnings', () => {
  let app;
  let initialEnv;

  beforeEach(() => {
    initialEnv = { ...process.env };
    app = { locals: {} };
    process.env.CDN_PROVIDER = undefined;
  });

  afterEach(() => {
    process.env = { ...initialEnv };
  });

  it('should update app.locals with default values if loadCustomConfig returns undefined', async () => {
    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(undefined));

    await AppService(app);

    expect(app.locals).toBeDefined();
    expect(app.locals.paths).toBeDefined();
    expect(app.locals.availableTools).toBeDefined();
    expect(app.locals.fileStrategy).toEqual('local');
    expect(app.locals.socialLogins).toEqual(defaultSocialLogins);
  });

  it('should update app.locals with values from loadCustomConfig', async () => {
    const customConfig = {
      fileStrategy: 'firebase',
      registration: { socialLogins: ['testLogin'] },
    };
    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(customConfig));

    await AppService(app);

    expect(app.locals).toBeDefined();
    expect(app.locals.paths).toBeDefined();
    expect(app.locals.availableTools).toBeDefined();
    expect(app.locals.fileStrategy).toEqual(customConfig.fileStrategy);
    expect(app.locals.socialLogins).toEqual(customConfig.registration.socialLogins);
  });

  it('should apply the assistants endpoint configuration correctly to app.locals', async () => {
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
    const loadCustomConfig = require('./Config/loadCustomConfig');
    loadCustomConfig.mockImplementationOnce(() => Promise.resolve(mockConfig));

    await AppService(app);

    expect(app.locals).toHaveProperty('assistants');
    const { assistants } = app.locals;
    expect(assistants.disableBuilder).toBe(true);
    expect(assistants.pollIntervalMs).toBe(5000);
    expect(assistants.timeoutMs).toBe(30000);
    expect(assistants.supportedIds).toEqual(['id1', 'id2']);
    expect(assistants.excludedIds).toBeUndefined();
  });
});
