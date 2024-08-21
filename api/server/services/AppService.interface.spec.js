jest.mock('~/models/Role', () => ({
  initializeRoles: jest.fn(),
  updatePromptsAccess: jest.fn(),
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
}));

const AppService = require('./AppService');
const { loadDefaultInterface } = require('./start/interface');

describe('AppService interface.prompts configuration', () => {
  let app;
  let mockLoadCustomConfig;

  beforeEach(() => {
    app = { locals: {} };
    jest.resetModules();
    jest.clearAllMocks();
    mockLoadCustomConfig = require('./Config/loadCustomConfig');
  });

  it('should set prompts to true when loadDefaultInterface returns true', async () => {
    mockLoadCustomConfig.mockResolvedValue({});
    loadDefaultInterface.mockResolvedValue({ prompts: true });

    await AppService(app);

    expect(app.locals.interfaceConfig.prompts).toBe(true);
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should set prompts to false when loadDefaultInterface returns false', async () => {
    mockLoadCustomConfig.mockResolvedValue({ interface: { prompts: false } });
    loadDefaultInterface.mockResolvedValue({ prompts: false });

    await AppService(app);

    expect(app.locals.interfaceConfig.prompts).toBe(false);
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should not set prompts when loadDefaultInterface returns undefined', async () => {
    mockLoadCustomConfig.mockResolvedValue({});
    loadDefaultInterface.mockResolvedValue({});

    await AppService(app);

    expect(app.locals.interfaceConfig.prompts).toBeUndefined();
    expect(loadDefaultInterface).toHaveBeenCalled();
  });
});
