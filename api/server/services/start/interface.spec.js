const { SystemRoles, Permissions, PermissionTypes } = require('librechat-data-provider');
const { updateAccessPermissions, getRoleByName } = require('~/models/Role');
const { loadDefaultInterface } = require('./interface');

jest.mock('~/models/Role', () => ({
  updateAccessPermissions: jest.fn(),
  getRoleByName: jest.fn(),
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

    const expectedPermissions = {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
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
      expectedPermissions,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissions,
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

    const expectedPermissions = {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: false, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
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
      expectedPermissions,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissions,
      null,
    );
  });

  it('should call updateAccessPermissions with undefined when permission types are not specified in config', async () => {
    const config = {};
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    const expectedPermissions = {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: undefined,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: undefined,
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_ROLES]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);

    // Check USER role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissions,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissions,
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
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    const expectedPermissions = {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: true, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: undefined,
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_ROLES]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);

    // Check USER role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissions,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissions,
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

    const expectedPermissions = {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: true, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: false },
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
      expectedPermissions,
      null,
    );

    // Check ADMIN role call
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissions,
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
      },
    };

    await loadDefaultInterface(config, configDefaults);

    // Should be called with all permissions EXCEPT prompts and agents (which already exist)
    const expectedPermissions = {
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: true, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: undefined,
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_ROLES]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissions,
      expect.objectContaining({
        permissions: {
          [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
          [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
        },
      }),
    );
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissions,
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
      },
    };

    await loadDefaultInterface(config, configDefaults);

    // Should update prompts (explicitly configured) and all other permissions that don't exist
    const expectedPermissions = {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true }, // Explicitly configured
      // All other permissions that don't exist in the database
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: undefined,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: undefined,
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_ROLES]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    };

    expect(updateAccessPermissions).toHaveBeenCalledTimes(2);
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.USER,
      expectedPermissions,
      expect.objectContaining({
        permissions: expect.any(Object),
      }),
    );
    expect(updateAccessPermissions).toHaveBeenCalledWith(
      SystemRoles.ADMIN,
      expectedPermissions,
      expect.objectContaining({
        permissions: expect.any(Object),
      }),
    );
  });
});
