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
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
    });
  });

  it('should call updateAccessPermissions with false when permission types are false', async () => {
    const config = {
      interface: {
        prompts: false,
        bookmarks: false,
        multiConvo: false,
        agents: false,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
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
    });
  });

  it('should call updateAccessPermissions with undefined when permission types are explicitly undefined', async () => {
    const config = {
      interface: {
        prompts: undefined,
        bookmarks: undefined,
        multiConvo: undefined,
        agents: undefined,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with mixed values for permission types', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: false,
        multiConvo: undefined,
        agents: true,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
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
      },
    };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: true },
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
    });
  });

  it('should call updateAccessPermissions with all interface options including multiConvo', async () => {
    const config = {
      interface: {
        prompts: true,
        bookmarks: false,
        multiConvo: true,
        agents: false,
      },
    };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: false },
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
      },
    };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
      [PermissionTypes.AGENTS]: { [Permissions.USE]: undefined },
    });
  });
});
