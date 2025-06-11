const { SystemRoles, Permissions, PermissionTypes } = require('librechat-data-provider');
const { updateAccessPermissions } = require('~/models/Role');
const { loadDefaultInterface } = require('./interface');

jest.mock('~/models/Role', () => ({
  updateAccessPermissions: jest.fn(),
}));

describe('loadDefaultInterface', () => {
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
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
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
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    });
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
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: false, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: false },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: false },
    });
  });

  it('should call updateAccessPermissions with undefined when permission types are not specified in config', async () => {
    const config = {};
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
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
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with undefined when permission types are explicitly undefined', async () => {
    const config = {
      interface: {
        prompts: undefined,
        bookmarks: undefined,
        memories: undefined,
        multiConvo: undefined,
        agents: undefined,
        temporaryChat: undefined,
        runCode: undefined,
        webSearch: undefined,
        fileSearch: undefined,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
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
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    });
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

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
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
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: false },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    });
  });

  it('should call updateAccessPermissions with true when config is undefined', async () => {
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

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: true, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    });
  });

  it('should call updateAccessPermissions with the correct parameters when multiConvo is true', async () => {
    const config = { interface: { multiConvo: true } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: undefined,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with false when multiConvo is false', async () => {
    const config = { interface: { multiConvo: false } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: undefined,
        [Permissions.OPT_OUT]: undefined,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with undefined when multiConvo is not specified in config', async () => {
    const config = {};
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
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
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with all interface options including multiConvo', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: false,
        memories: true,
        multiConvo: true,
        agents: false,
        temporaryChat: true,
        runCode: false,
        fileSearch: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: true, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    });
  });

  it('should use default values for multiConvo when config is undefined', async () => {
    const config = undefined;
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        memories: false,
        multiConvo: false,
        agents: undefined,
        temporaryChat: undefined,
        runCode: undefined,
        webSearch: undefined,
        fileSearch: true,
      },
    };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: false, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with the correct parameters when WEB_SEARCH is undefined', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: false,
        memories: true,
        multiConvo: true,
        agents: false,
        temporaryChat: true,
        runCode: false,
        fileCitations: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: true, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with the correct parameters when FILE_SEARCH is true', async () => {
    const config = {
      interface: {
        fileSearch: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
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
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
    });
  });

  it('should call updateAccessPermissions with false when FILE_SEARCH is false', async () => {
    const config = {
      interface: {
        fileSearch: false,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
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
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: false },
    });
  });

  it('should call updateAccessPermissions with all interface options including fileSearch', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: false,
        memories: true,
        multiConvo: true,
        agents: false,
        temporaryChat: true,
        runCode: false,
        webSearch: true,
        fileSearch: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: true, [Permissions.OPT_OUT]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.MARKETPLACE]: { [Permissions.USE]: undefined },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_GROUPS]: undefined,
        [Permissions.VIEW_USERS]: undefined,
      },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    });
  });

  it('should call updateAccessPermissions with the correct parameters when fileCitations is true', async () => {
    const config = { interface: { fileCitations: true } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    });
  });

  it('should call updateAccessPermissions with false when fileCitations is false', async () => {
    const config = { interface: { fileCitations: false } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MEMORIES]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: undefined },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: false },
    });
  });
});
