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
});
