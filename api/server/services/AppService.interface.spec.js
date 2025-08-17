jest.mock('~/models', () => ({
  initializeRoles: jest.fn(),
  seedDefaultRoles: jest.fn(),
  ensureDefaultCategories: jest.fn(),
}));
jest.mock('~/models/Role', () => ({
  updateAccessPermissions: jest.fn(),
  getRoleByName: jest.fn().mockResolvedValue(null),
  updateRoleByName: jest.fn(),
}));

jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

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

jest.mock('./Config', () => ({
  setAppConfig: jest.fn(),
  getAppConfig: jest.fn(),
  setCachedTools: jest.fn(),
  loadCustomConfig: jest.fn(),
}));

const AppService = require('./AppService');
const { loadDefaultInterface } = require('./start/interface');

describe('AppService interface configuration', () => {
  let mockLoadCustomConfig;
  const { setAppConfig } = require('./Config');

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    ({ loadCustomConfig: mockLoadCustomConfig } = require('./Config'));
  });

  it('should set prompts and bookmarks to true when loadDefaultInterface returns true for both', async () => {
    mockLoadCustomConfig.mockResolvedValue({});
    loadDefaultInterface.mockResolvedValue({ prompts: true, bookmarks: true });

    await AppService();

    expect(setAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceConfig: expect.objectContaining({
          prompts: true,
          bookmarks: true,
        }),
      }),
    );
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should set prompts and bookmarks to false when loadDefaultInterface returns false for both', async () => {
    mockLoadCustomConfig.mockResolvedValue({ interface: { prompts: false, bookmarks: false } });
    loadDefaultInterface.mockResolvedValue({ prompts: false, bookmarks: false });

    await AppService();

    expect(setAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceConfig: expect.objectContaining({
          prompts: false,
          bookmarks: false,
        }),
      }),
    );
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should not set prompts and bookmarks when loadDefaultInterface returns undefined for both', async () => {
    mockLoadCustomConfig.mockResolvedValue({});
    loadDefaultInterface.mockResolvedValue({});

    await AppService();

    expect(setAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceConfig: expect.anything(),
      }),
    );

    // Verify that prompts and bookmarks are undefined when not provided
    const initCall = setAppConfig.mock.calls[0][0];
    expect(initCall.interfaceConfig.prompts).toBeUndefined();
    expect(initCall.interfaceConfig.bookmarks).toBeUndefined();
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should set prompts and bookmarks to different values when loadDefaultInterface returns different values', async () => {
    mockLoadCustomConfig.mockResolvedValue({ interface: { prompts: true, bookmarks: false } });
    loadDefaultInterface.mockResolvedValue({ prompts: true, bookmarks: false });

    await AppService();

    expect(setAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceConfig: expect.objectContaining({
          prompts: true,
          bookmarks: false,
        }),
      }),
    );
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should correctly configure peoplePicker permissions including roles', async () => {
    mockLoadCustomConfig.mockResolvedValue({
      interface: {
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
      },
    });
    loadDefaultInterface.mockResolvedValue({
      peoplePicker: {
        users: true,
        groups: true,
        roles: true,
      },
    });

    await AppService();

    expect(setAppConfig).toHaveBeenCalledWith(
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
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should handle mixed peoplePicker permissions', async () => {
    mockLoadCustomConfig.mockResolvedValue({
      interface: {
        peoplePicker: {
          users: true,
          groups: false,
          roles: true,
        },
      },
    });
    loadDefaultInterface.mockResolvedValue({
      peoplePicker: {
        users: true,
        groups: false,
        roles: true,
      },
    });

    await AppService();

    expect(setAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceConfig: expect.objectContaining({
          peoplePicker: expect.objectContaining({
            users: true,
            groups: false,
            roles: true,
          }),
        }),
      }),
    );
  });

  it('should set default peoplePicker permissions when not provided', async () => {
    mockLoadCustomConfig.mockResolvedValue({});
    loadDefaultInterface.mockResolvedValue({
      peoplePicker: {
        users: true,
        groups: true,
        roles: true,
      },
    });

    await AppService();

    expect(setAppConfig).toHaveBeenCalledWith(
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
