const {
  SystemRoles,
  Permissions,
  PermissionTypes,
  roleDefaults,
} = require('librechat-data-provider');
const { updateAccessPermissions, getRoleByName } = require('~/models/Role');
const { loadDefaultInterface } = require('./interface');

jest.mock('~/models/Role', () => ({
  updateAccessPermissions: jest.fn(),
  getRoleByName: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isMemoryEnabled: jest.fn((config) => config?.enable === true),
}));

describe('loadDefaultInterface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock getRoleByName to return null (no existing permissions)
    getRoleByName.mockResolvedValue(null);
  });

  it('should call updateAccessPermissions with the correct parameters when permission types are true', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: true,
        memories: true,
        multiConvo: true,
        agents: true,
        temporaryChat: true,
        runCode: true,
        webSearch: true,
        fileSearch: true,
        fileCitations: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: true,
        },
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    const expectedPermissionsForUser = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: true },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: true,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    const expectedPermissionsForAdmin = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: true },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: true,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);

    // Check USER role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissionsForUser,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissionsForAdmin,
      null,
    );
  });

  it('should call updateAccessPermissions with false when permission types are false', async () => {
    const config = {
      interface: {
        prompts: false,
        bookmarks: false,
        memories: false,
        multiConvo: false,
        agents: false,
        temporaryChat: false,
        runCode: false,
        webSearch: false,
        fileSearch: false,
        fileCitations: false,
        peoplePicker: {
          users: false,
          groups: false,
          roles: false,
        },
        marketplace: {
          use: false,
        },
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    const expectedPermissionsForUser = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: false,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: false,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: false,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: false },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: false,
        [Permissions.VIEW_GROUPS]: false,
        [Permissions.VIEW_ROLES]: false,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: false },
    };

    const expectedPermissionsForAdmin = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: false,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: false,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: false,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: false },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: false,
        [Permissions.VIEW_GROUPS]: false,
        [Permissions.VIEW_ROLES]: false,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: false },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);

    // Check USER role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissionsForUser,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissionsForAdmin,
      null,
    );
  });

  it('should call updateAccessPermissions with role-specific defaults when permission types are not specified in config', async () => {
    const config = {};
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        memories: true,
        multiConvo: true,
        agents: true,
        temporaryChat: true,
        runCode: true,
        webSearch: true,
        fileSearch: true,
        fileCitations: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    const expectedPermissionsForUser = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: false,
        [Permissions.VIEW_GROUPS]: false,
        [Permissions.VIEW_ROLES]: false,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    const expectedPermissionsForAdmin = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: true },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: true,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);

    // Check USER role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissionsForUser,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissionsForAdmin,
      null,
    );
  });

  it('should call updateAccessPermissions with mixed values for permission types', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: false,
        memories: true,
        multiConvo: undefined,
        agents: true,
        temporaryChat: undefined,
        runCode: false,
        webSearch: true,
        fileSearch: false,
        fileCitations: true,
      },
    };
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        memories: true,
        multiConvo: true,
        agents: true,
        temporaryChat: true,
        runCode: true,
        webSearch: true,
        fileSearch: true,
        fileCitations: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    const expectedPermissionsForUser = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: false,
        [Permissions.VIEW_GROUPS]: false,
        [Permissions.VIEW_ROLES]: false,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    const expectedPermissionsForAdmin = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: true },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: true,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);

    // Check USER role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissionsForUser,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissionsForAdmin,
      null,
    );
  });

  it('should use default values when config is undefined', async () => {
    const config = undefined;
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        memories: true,
        multiConvo: true,
        agents: true,
        temporaryChat: true,
        runCode: true,
        webSearch: true,
        fileSearch: true,
        fileCitations: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    const expectedPermissionsForUser = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: false,
        [Permissions.VIEW_GROUPS]: false,
        [Permissions.VIEW_ROLES]: false,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    const expectedPermissionsForAdmin = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: true },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: true,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);

    // Check USER role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissionsForUser,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissionsForAdmin,
      null,
    );
  });

  it('should only update permissions that do not exist when no config provided', async () => {
    // Mock that some permissions already exist
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
        [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
      },
    });

    const config = undefined;
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        memories: true,
        multiConvo: true,
        agents: true,
        temporaryChat: true,
        runCode: true,
        webSearch: true,
        fileSearch: true,
        fileCitations: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    // Should be called with all permissions EXCEPT prompts and agents (which already exist)
    const expectedPermissionsForUser = {
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: false,
        [Permissions.VIEW_GROUPS]: false,
        [Permissions.VIEW_ROLES]: false,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    const expectedPermissionsForAdmin = {
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: true },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: true,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissionsForUser,
      expect.objectContaining({
        permissions: {
          [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
          [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
        },
      }),
    );
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissionsForAdmin,
      expect.objectContaining({
        permissions: {
          [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
          [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
        },
      }),
    );
  });

  it('should override existing permissions when explicitly configured', async () => {
    // Mock that some permissions already exist
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
        [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
        [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      },
    });

    const config = {
      interface: {
        prompts: true, // Explicitly set, should override existing false
        // agents not specified, so existing false should be preserved
        // bookmarks not specified, so existing false should be preserved
      },
    };
    const configDefaults = {
      interface: {
        prompts: false,
        agents: true,
        bookmarks: true,
        memories: true,
        multiConvo: true,
        temporaryChat: true,
        runCode: true,
        webSearch: true,
        fileSearch: true,
        fileCitations: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    // Should update prompts (explicitly configured) and all other permissions that don't exist
    const expectedPermissionsForUser = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      }, // Explicitly configured
      // All other permissions that don't exist in the database
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: false,
        [Permissions.VIEW_GROUPS]: false,
        [Permissions.VIEW_ROLES]: false,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    const expectedPermissionsForAdmin = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
      }, // Explicitly configured
      // All other permissions that don't exist in the database
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: true },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: true,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissionsForUser,
      expect.objectContaining({
        permissions: expect.any(Object),
      }),
    );
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissionsForAdmin,
      expect.objectContaining({
        permissions: expect.any(Object),
      }),
    );
  });

  it('should use role-specific defaults for PEOPLE_PICKER when peoplePicker config is undefined', async () => {
    const config = {
      interface: {
        // peoplePicker is not defined at all
        prompts: true,
        bookmarks: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);

    // Get the calls to updateAccessPermissions
    const userCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.USER,
    );
    const adminCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.ADMIN,
    );

    // For USER role, PEOPLE_PICKER should use USER defaults (false)
    expect(userCall[1][PermissionTypes.PEOPLE_PICKER]).toEqual({
      [Permissions.VIEW_USERS]: false,
      [Permissions.VIEW_GROUPS]: false,
      [Permissions.VIEW_ROLES]: false,
    });

    // For ADMIN role, PEOPLE_PICKER should use ADMIN defaults (true)
    expect(adminCall[1][PermissionTypes.PEOPLE_PICKER]).toEqual({
      [Permissions.VIEW_USERS]: true,
      [Permissions.VIEW_GROUPS]: true,
      [Permissions.VIEW_ROLES]: true,
    });
  });

  it('should use role-specific defaults for complex permissions when not configured', async () => {
    const config = {
      interface: {
        // Only configure some permissions, leave others undefined
        bookmarks: true,
        multiConvo: false,
      },
    };
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        memories: true,
        multiConvo: true,
        agents: true,
        temporaryChat: true,
        runCode: true,
        webSearch: true,
        fileSearch: true,
        fileCitations: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    const userCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.USER,
    );
    const adminCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.ADMIN,
    );

    // Check PROMPTS permissions use role defaults
    expect(userCall[1][PermissionTypes.PROMPTS]).toEqual({
      [Permissions.USE]: true,
    });

    expect(adminCall[1][PermissionTypes.PROMPTS]).toEqual({
      [Permissions.USE]: true,
    });

    // Check AGENTS permissions use role defaults
    expect(userCall[1][PermissionTypes.AGENTS]).toEqual({
      [Permissions.USE]: true,
    });

    expect(adminCall[1][PermissionTypes.AGENTS]).toEqual({
      [Permissions.USE]: true,
    });

    // Check MEMORIES permissions use role defaults
    expect(userCall[1][PermissionTypes.MEMORIES]).toEqual({
      [Permissions.USE]: true,
      [Permissions.OPT_OUT]: undefined,
    });

    expect(adminCall[1][PermissionTypes.MEMORIES]).toEqual({
      [Permissions.USE]: true,
      [Permissions.OPT_OUT]: undefined,
    });
  });

  it('should handle memories OPT_OUT based on personalization when memories are enabled', async () => {
    const config = {
      interface: {
        memories: true,
      },
      memory: {
        // Memory enabled with personalization
        enable: true,
        personalize: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    const userCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.USER,
    );
    const adminCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.ADMIN,
    );

    // Both roles should have OPT_OUT set to true when personalization is enabled
    expect(userCall[1][PermissionTypes.MEMORIES][Permissions.OPT_OUT]).toBe(true);
    expect(adminCall[1][PermissionTypes.MEMORIES][Permissions.OPT_OUT]).toBe(true);
  });

  it('should populate missing PEOPLE_PICKER and MARKETPLACE permissions with role-specific defaults', async () => {
    // Mock that PEOPLE_PICKER and MARKETPLACE permissions don't exist yet
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
        [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
        // PEOPLE_PICKER and MARKETPLACE are missing
      },
    });

    const config = {
      interface: {
        prompts: true,
        bookmarks: true,
      },
    };
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    const userCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.USER,
    );
    const adminCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.ADMIN,
    );

    // Check that PEOPLE_PICKER uses role-specific defaults from roleDefaults
    expect(userCall[1][PermissionTypes.PEOPLE_PICKER]).toEqual({
      [Permissions.VIEW_USERS]:
        roleDefaults[SystemRoles.USER].permissions[PermissionTypes.PEOPLE_PICKER][
          Permissions.VIEW_USERS
        ],
      [Permissions.VIEW_GROUPS]:
        roleDefaults[SystemRoles.USER].permissions[PermissionTypes.PEOPLE_PICKER][
          Permissions.VIEW_GROUPS
        ],
      [Permissions.VIEW_ROLES]:
        roleDefaults[SystemRoles.USER].permissions[PermissionTypes.PEOPLE_PICKER][
          Permissions.VIEW_ROLES
        ],
    });

    expect(adminCall[1][PermissionTypes.PEOPLE_PICKER]).toEqual({
      [Permissions.VIEW_USERS]:
        roleDefaults[SystemRoles.ADMIN].permissions[PermissionTypes.PEOPLE_PICKER][
          Permissions.VIEW_USERS
        ],
      [Permissions.VIEW_GROUPS]:
        roleDefaults[SystemRoles.ADMIN].permissions[PermissionTypes.PEOPLE_PICKER][
          Permissions.VIEW_GROUPS
        ],
      [Permissions.VIEW_ROLES]:
        roleDefaults[SystemRoles.ADMIN].permissions[PermissionTypes.PEOPLE_PICKER][
          Permissions.VIEW_ROLES
        ],
    });

    // Check that MARKETPLACE uses role-specific defaults from roleDefaults
    expect(userCall[1][PermissionTypes.MARKETPLACE]).toEqual({
      [Permissions.USE]:
        roleDefaults[SystemRoles.USER].permissions[PermissionTypes.MARKETPLACE][Permissions.USE],
    });

    expect(adminCall[1][PermissionTypes.MARKETPLACE]).toEqual({
      [Permissions.USE]:
        roleDefaults[SystemRoles.ADMIN].permissions[PermissionTypes.MARKETPLACE][Permissions.USE],
    });
  });

  it('should leave all existing permissions unchanged when nothing is configured', async () => {
    // Mock existing permissions with values that differ from defaults
    const existingUserPermissions = {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: false },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: false,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: true },
    };

    getRoleByName.mockResolvedValue({
      permissions: existingUserPermissions,
    });

    // No config provided
    const config = undefined;
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        memories: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    // Should only update permissions that don't exist
    const userCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.USER,
    );

    // Should only have permissions for things that don't exist in the role
    expect(userCall[1]).not.toHaveProperty(PermissionTypes.PROMPTS);
    expect(userCall[1]).not.toHaveProperty(PermissionTypes.BOOKMARKS);
    expect(userCall[1]).not.toHaveProperty(PermissionTypes.MEMORIES);
    expect(userCall[1]).not.toHaveProperty(PermissionTypes.PEOPLE_PICKER);
    expect(userCall[1]).not.toHaveProperty(PermissionTypes.MARKETPLACE);

    // Should have other permissions that weren't in existingUserPermissions
    expect(userCall[1]).toHaveProperty(PermissionTypes.MULTI_CONVO);
    expect(userCall[1]).toHaveProperty(PermissionTypes.AGENTS);
  });

  it('should only call getRoleByName once per role for efficiency', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    // Should call getRoleByName exactly twice (once for USER, once for ADMIN)
    expect(getRoleByName).toHaveBeenCalledTimes(2);
    expect(getRoleByName).toHaveBeenCalledWith(SystemRoles.USER);
    expect(getRoleByName).toHaveBeenCalledWith(SystemRoles.ADMIN);
  });

  it('should only update explicitly configured permissions and leave others unchanged', async () => {
    // Mock existing permissions
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
        [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
        [PermissionTypes.MEMORIES]: { [Permissions.USE]: false },
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: false,
          [Permissions.VIEW_GROUPS]: false,
          [Permissions.VIEW_ROLES]: false,
        },
        [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
      },
    });

    // Only configure some permissions
    const config = {
      interface: {
        prompts: true, // Explicitly set to true
        bookmarks: true, // Explicitly set to true
        // memories not configured - should remain unchanged
        // peoplePicker not configured - should remain unchanged
        marketplace: {
          use: true, // Explicitly set to true
        },
      },
    };
    const configDefaults = {
      interface: {
        prompts: false,
        bookmarks: false,
        memories: true,
        peoplePicker: {
          users: true,
          groups: true,
          roles: true,
        },
        marketplace: {
          use: false,
        },
      },
    };

    await loadDefaultInterface(config, configDefaults);

    const userCall = updateAccessPermissions.mock.calls.find(
      (call) => call[0] === SystemRoles.USER,
    );

    // Explicitly configured permissions should be updated
    expect(userCall[1][PermissionTypes.PROMPTS]).toEqual({
      [Permissions.USE]: true,
    });
    expect(userCall[1][PermissionTypes.BOOKMARKS]).toEqual({ [Permissions.USE]: true });
    expect(userCall[1][PermissionTypes.MARKETPLACE]).toEqual({ [Permissions.USE]: true });

    // Unconfigured permissions should not be present (left unchanged)
    expect(userCall[1]).not.toHaveProperty(PermissionTypes.MEMORIES);
    expect(userCall[1]).not.toHaveProperty(PermissionTypes.PEOPLE_PICKER);

    // New permissions that didn't exist should still be added
    expect(userCall[1]).toHaveProperty(PermissionTypes.AGENTS);
    expect(userCall[1]).toHaveProperty(PermissionTypes.MULTI_CONVO);
  });
});
