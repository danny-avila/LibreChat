const { SystemRoles, Permissions } = require('librechat-data-provider');
const { updatePromptsAccess } = require('~/models/Role');
const { loadDefaultInterface } = require('./interface');

jest.mock('~/models/Role', () => ({
  updatePromptsAccess: jest.fn(),
  updateBookmarksAccess: jest.fn(),
}));

describe('loadDefaultInterface', () => {
  it('should call updatePromptsAccess with the correct parameters when prompts is true', async () => {
    const config = { interface: { prompts: true } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updatePromptsAccess).toHaveBeenCalledWith(SystemRoles.USER, { [Permissions.USE]: true });
  });

  it('should call updatePromptsAccess with false when prompts is false', async () => {
    const config = { interface: { prompts: false } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updatePromptsAccess).toHaveBeenCalledWith(SystemRoles.USER, {
      [Permissions.USE]: false,
    });
  });

  it('should call updatePromptsAccess with undefined when prompts is not specified in config', async () => {
    const config = {};
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updatePromptsAccess).toHaveBeenCalledWith(SystemRoles.USER, {
      [Permissions.USE]: undefined,
    });
  });

  it('should call updatePromptsAccess with undefined when prompts is explicitly undefined', async () => {
    const config = { interface: { prompts: undefined } };
    const configDefaults = { interface: {} };

    await loadDefaultInterface(config, configDefaults);

    expect(updatePromptsAccess).toHaveBeenCalledWith(SystemRoles.USER, {
      [Permissions.USE]: undefined,
    });
  });
});
