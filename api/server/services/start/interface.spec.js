const { SystemRoles, Permissions, PermissionTypes } = require('librechat-data-provider');
const { updateAccessPermissions } = require('~/models/Role');
const { loadDefaultInterface } = require('./interface');

jest.mock('~/models/Role', () => ({
  updateAccessPermissions: jest.fn(),
}));

describe('loadDefaultInterface', () => {
  it('should call updateAccessPermissions with the correct parameters when prompts and bookmarks are true', async () => {
    const config = { interface: { prompts: true, bookmarks: true } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with false when prompts and bookmarks are false', async () => {
    const config = { interface: { prompts: false, bookmarks: false } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: false },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with undefined when prompts and bookmarks are not specified in config', async () => {
    const config = {};
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with undefined when prompts and bookmarks are explicitly undefined', async () => {
    const config = { interface: { prompts: undefined, bookmarks: undefined } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: undefined },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: undefined },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with mixed values for prompts and bookmarks', async () => {
    const config = { interface: { prompts: true, bookmarks: false } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
    });
  });

  it('should call updateAccessPermissions with true when config is undefined', async () => {
    const config = undefined;
    const configDefaults = { interface: { prompts: true, bookmarks: true } };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: undefined },
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
    });
  });

  it('should call updateAccessPermissions with all interface options including multiConvo', async () => {
    const config = { interface: { prompts: true, bookmarks: false, multiConvo: true } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
    });
  });

  it('should use default values for multiConvo when config is undefined', async () => {
    const config = undefined;
    const configDefaults = { interface: { prompts: true, bookmarks: true, multiConvo: false } };

    await loadDefaultInterface(config, configDefaults);

    expect(updateAccessPermissions).toHaveBeenCalledWith(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { [Permissions.USE]: true },
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: false },
    });
  });
});
