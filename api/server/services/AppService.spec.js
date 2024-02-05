const { FileSources } = require('librechat-data-provider');

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
});
