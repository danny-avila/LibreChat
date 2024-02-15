const { FileSources, defaultSocialLogins } = require('librechat-data-provider');

const AppService = require('./AppService');

jest.mock('./Config/loadCustomConfig', () => {
  return jest.fn(() =>
    Promise.resolve({
      registration: { socialLogins: ['testLogin'] },
      fileStrategy: 'testStrategy',
    }),
  );
});
jest.mock('./Files/Firebase/initialize', () => ({
  initializeFirebase: jest.fn(),
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

describe('AppService', () => {
  let app;

  beforeEach(() => {
    app = { locals: {} };
    process.env.CDN_PROVIDER = undefined;
  });

  it('should correctly assign process.env and app.locals based on custom config', async () => {
    await AppService(app);

    expect(process.env.CDN_PROVIDER).toEqual('testStrategy');

    expect(app.locals).toEqual({
      socialLogins: ['testLogin'],
      fileStrategy: 'testStrategy',
      availableTools: {
        ExampleTool: {
          type: 'function',
          function: expect.objectContaining({
            description: 'Example tool function',
            name: 'exampleFunction',
            parameters: expect.objectContaining({
              type: 'object',
              properties: expect.any(Object),
              required: expect.arrayContaining(['param1']),
            }),
          }),
        },
      },
      paths: expect.anything(),
    });
  });

  it('should log a warning if the config version is outdated', async () => {
    require('./Config/loadCustomConfig').mockImplementationOnce(() =>
      Promise.resolve({
        version: '0.9.0', // An outdated version for this test
        registration: { socialLogins: ['testLogin'] },
        fileStrategy: 'testStrategy',
      }),
    );

    await AppService(app);

    const { logger } = require('~/config');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Outdated Config version'));
  });

  it('should initialize Firebase when fileStrategy is firebase', async () => {
    require('./Config/loadCustomConfig').mockImplementationOnce(() =>
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
      directory: expect.anything(),
      filter: expect.anything(),
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

  it('should correctly configure endpoints based on custom config', async () => {
    require('./Config/loadCustomConfig').mockImplementationOnce(() =>
      Promise.resolve({
        endpoints: {
          assistants: {
            disableBuilder: true,
            pollIntervalMs: 5000,
            timeoutMs: 30000,
            supportedIds: ['id1', 'id2'],
          },
        },
      }),
    );

    await AppService(app);

    expect(app.locals).toHaveProperty('assistants');
    expect(app.locals.assistants).toEqual(
      expect.objectContaining({
        disableBuilder: true,
        pollIntervalMs: 5000,
        timeoutMs: 30000,
        supportedIds: expect.arrayContaining(['id1', 'id2']),
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

    await AppService(app);

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

    require('./Config/loadCustomConfig').mockImplementationOnce(() =>
      Promise.resolve(rateLimitsConfig),
    );

    await AppService(app);

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

    // Mock a custom configuration without specific rate limits
    require('./Config/loadCustomConfig').mockImplementationOnce(() => Promise.resolve({}));

    await AppService(app);

    // Verify that process.env falls back to the initial values
    expect(process.env.FILE_UPLOAD_IP_MAX).toEqual('initialMax');
    expect(process.env.FILE_UPLOAD_IP_WINDOW).toEqual('initialWindow');
    expect(process.env.FILE_UPLOAD_USER_MAX).toEqual('initialUserMax');
    expect(process.env.FILE_UPLOAD_USER_WINDOW).toEqual('initialUserWindow');
  });
});

describe('AppService updating app.locals', () => {
  let app;
  let initialEnv;

  beforeEach(() => {
    // Store initial environment variables to restore them after each test
    initialEnv = { ...process.env };

    app = { locals: {} };
    process.env.CDN_PROVIDER = undefined;
  });

  afterEach(() => {
    // Restore initial environment variables
    process.env = { ...initialEnv };
  });

  it('should update app.locals with default values if loadCustomConfig returns undefined', async () => {
    // Mock loadCustomConfig to return undefined
    require('./Config/loadCustomConfig').mockImplementationOnce(() => Promise.resolve(undefined));

    await AppService(app);

    expect(app.locals).toBeDefined();
    expect(app.locals.paths).toBeDefined();
    expect(app.locals.availableTools).toBeDefined();
    expect(app.locals.fileStrategy).toEqual(FileSources.local);
    expect(app.locals.socialLogins).toEqual(defaultSocialLogins);
  });

  it('should update app.locals with values from loadCustomConfig', async () => {
    // Mock loadCustomConfig to return a specific config object
    const customConfig = {
      fileStrategy: 'firebase',
      registration: { socialLogins: ['testLogin'] },
    };
    require('./Config/loadCustomConfig').mockImplementationOnce(() =>
      Promise.resolve(customConfig),
    );

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
    require('./Config/loadCustomConfig').mockImplementationOnce(() => Promise.resolve(mockConfig));

    const app = { locals: {} };
    await AppService(app);

    expect(app.locals).toHaveProperty('assistants');
    const { assistants } = app.locals;
    expect(assistants.disableBuilder).toBe(true);
    expect(assistants.pollIntervalMs).toBe(5000);
    expect(assistants.timeoutMs).toBe(30000);
    expect(assistants.supportedIds).toEqual(['id1', 'id2']);
    expect(assistants.excludedIds).toBeUndefined();
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
    require('./Config/loadCustomConfig').mockImplementationOnce(() => Promise.resolve(mockConfig));

    const app = { locals: {} };
    await require('./AppService')(app);

    const { logger } = require('~/config');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Both `supportedIds` and `excludedIds` are defined'),
    );
  });
});
