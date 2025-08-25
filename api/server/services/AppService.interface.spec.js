jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  loadDefaultInterface: jest.fn(),
}));
jest.mock('./start/tools', () => ({
  loadAndFormatTools: jest.fn().mockReturnValue({}),
}));
jest.mock('./start/checks', () => ({
  checkVariables: jest.fn(),
  checkHealth: jest.fn(),
  checkConfig: jest.fn(),
  checkAzureVariables: jest.fn(),
  checkWebSearchConfig: jest.fn(),
}));

jest.mock('./Config/loadCustomConfig', () => jest.fn());

const AppService = require('./AppService');
const { loadDefaultInterface } = require('@librechat/api');

describe('AppService interface configuration', () => {
  let mockLoadCustomConfig;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockLoadCustomConfig = require('./Config/loadCustomConfig');
  });

  it('should set prompts and bookmarks to true when loadDefaultInterface returns true for both', async () => {
    mockLoadCustomConfig.mockResolvedValue({});
    loadDefaultInterface.mockResolvedValue({ prompts: true, bookmarks: true });

    const result = await AppService();

    expect(result).toEqual(
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

    const result = await AppService();

    expect(result).toEqual(
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

    const result = await AppService();

    expect(result).toEqual(
      expect.objectContaining({
        interfaceConfig: expect.anything(),
      }),
    );

    // Verify that prompts and bookmarks are undefined when not provided
    expect(result.interfaceConfig.prompts).toBeUndefined();
    expect(result.interfaceConfig.bookmarks).toBeUndefined();
    expect(loadDefaultInterface).toHaveBeenCalled();
  });

  it('should set prompts and bookmarks to different values when loadDefaultInterface returns different values', async () => {
    mockLoadCustomConfig.mockResolvedValue({ interface: { prompts: true, bookmarks: false } });
    loadDefaultInterface.mockResolvedValue({ prompts: true, bookmarks: false });

    const result = await AppService();

    expect(result).toEqual(
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

    const result = await AppService();

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

    const result = await AppService();

    expect(result).toEqual(
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

    const result = await AppService();

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
