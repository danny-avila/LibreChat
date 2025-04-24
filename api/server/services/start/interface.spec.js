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
        multiConvo: true,
        agents: true,
        temporaryChat: true,
        runCode: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
    });
  });

  it('should call updateAccessPermissions with false when permission types are false', async () => {
    const config = {
      interface: {
        prompts: false,
        bookmarks: false,
        multiConvo: false,
        agents: false,
        temporaryChat: false,
        runCode: false,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: false },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
    });
  });

  it('should call updateAccessPermissions with undefined when permission types are not specified in config', async () => {
    const config = {};
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with undefined when permission types are explicitly undefined', async () => {
    const config = {
      interface: {
        prompts: undefined,
        bookmarks: undefined,
        multiConvo: undefined,
        agents: undefined,
        temporaryChat: undefined,
        runCode: undefined,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with mixed values for permission types', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: false,
        multiConvo: undefined,
        agents: true,
        temporaryChat: undefined,
        runCode: false,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
    });
  });

  it('should call updateAccessPermissions with true when config is undefined', async () => {
    const config = undefined;
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        multiConvo: true,
        agents: true,
        temporaryChat: true,
        runCode: true,
      },
    };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
    });
  });

  it('should call updateAccessPermissions with the correct parameters when multiConvo is true', async () => {
    const config = { interface: { multiConvo: true } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with false when multiConvo is false', async () => {
    const config = { interface: { multiConvo: false } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with undefined when multiConvo is not specified in config', async () => {
    const config = {};
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with all interface options including multiConvo', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: false,
        multiConvo: true,
        agents: false,
        temporaryChat: true,
        runCode: false,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false },
    });
  });

  it('should use default values for multiConvo when config is undefined', async () => {
    const config = undefined;
    const configDefaults = {
      interface: {
        prompts: true,
        bookmarks: true,
        multiConvo: false,
        agents: undefined,
        temporaryChat: undefined,
        runCode: undefined,
      },
    };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: undefined },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: undefined },
    });
  });
});
