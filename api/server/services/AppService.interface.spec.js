jest.mock('~/models', () => ({
  initializeRoles: jest.fn(),
}));
jest.mock('~/models/Role', () => ({
  updateAccessPermissions: jest.fn(),
  getRoleByName: jest.fn(),
  updateRoleByName: jest.fn(),
}));

jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('./Config/loadCustomConfig', () => jest.fn());
jest.mock('./start/interface', () => ({
  loadDefaultInterface: jest.fn(),
}));
jest.mock('./ToolService', () => ({
  loadAndFormatTools: jest.fn().mockReturnValue({}),
}));
jest.mock('./start/checks', () => ({
  checkVariables: jest.fn(),
  checkHealth: jest.fn(),
  checkConfig: jest.fn(),
  checkAzureVariables: jest.fn(),
  checkWebSearchConfig: jest.fn(),
}));

const AppService = require('./AppService');
const { loadDefaultInterface } = require('./start/interface');

describe('AppService interface configuration', () => {
  let app;
  let mockLoadCustomConfig;

  beforeEach(() => {
    app = { locals: {} };
    jest.resetModules();
    jest.clearAllMocks();
    mockLoadCustomConfig = require('./Config/loadCustomConfig');
  });

  it('should set prompts and bookmarks to true when loadDefaultInterface returns true for both', async () => {
    mockLoadCustomConfig.mockResolvedValue({});
    loadDefaultInterface.mockResolvedValue({ prompts: true, bookmarks: true });

    await AppService(app);

    expect(app.locals.interfaceConfig.prompts).toBe(true);
    expect(app.locals.interfaceConfig.bookmarks).toBe(true);
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should set prompts and bookmarks to false when loadDefaultInterface returns false for both', async () => {
    mockLoadCustomConfig.mockResolvedValue({ interface: { prompts: false, bookmarks: false } });
    loadDefaultInterface.mockResolvedValue({ prompts: false, bookmarks: false });

    await AppService(app);

    expect(app.locals.interfaceConfig.prompts).toBe(false);
    expect(app.locals.interfaceConfig.bookmarks).toBe(false);
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should not set prompts and bookmarks when loadDefaultInterface returns undefined for both', async () => {
    mockLoadCustomConfig.mockResolvedValue({});
    loadDefaultInterface.mockResolvedValue({});

    await AppService(app);

    expect(app.locals.interfaceConfig.prompts).toBeUndefined();
    expect(app.locals.interfaceConfig.bookmarks).toBeUndefined();
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should set prompts and bookmarks to different values when loadDefaultInterface returns different values', async () => {
    mockLoadCustomConfig.mockResolvedValue({ interface: { prompts: true, bookmarks: false } });
    loadDefaultInterface.mockResolvedValue({ prompts: true, bookmarks: false });

    await AppService(app);

    expect(app.locals.interfaceConfig.prompts).toBe(true);
    expect(app.locals.interfaceConfig.bookmarks).toBe(false);
    expect(loadDefaultInterface).toHaveBeenCalled();
  });
});
