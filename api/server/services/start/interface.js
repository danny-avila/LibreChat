const {
  SystemRoles,
  Permissions,
  PermissionTypes,
  removeNullishValues,
} = require('librechat-data-provider');
const { updateAccessPermissions } = require('~/models/Role');
const { logger } = require('~/config');

/**
 * Loads the default interface object.
 * @param {TCustomConfig | undefined} config - The loaded custom configuration.
 * @param {TConfigDefaults} configDefaults - The custom configuration default values.
 * @param {SystemRoles} [roleName] - The role to load the default interface for, defaults to `'USER'`.
 * @returns {Promise<TCustomConfig['interface']>} The default interface object.
 */
async function loadDefaultInterface(config, configDefaults, roleName = SystemRoles.USER) {
  const { interface: interfaceConfig } = config ?? {};
  const { interface: defaults } = configDefaults;
  const hasModelSpecs = config?.modelSpecs?.list?.length > 0;

  /** @type {TCustomConfig['interface']} */
  const loadedInterface = removeNullishValues({
    endpointsMenu:
      interfaceConfig?.endpointsMenu ?? (hasModelSpecs ? false : defaults.endpointsMenu),
    modelSelect: interfaceConfig?.modelSelect ?? (hasModelSpecs ? false : defaults.modelSelect),
    parameters: interfaceConfig?.parameters ?? (hasModelSpecs ? false : defaults.parameters),
    presets: interfaceConfig?.presets ?? (hasModelSpecs ? false : defaults.presets),
    sidePanel: interfaceConfig?.sidePanel ?? defaults.sidePanel,
    privacyPolicy: interfaceConfig?.privacyPolicy ?? defaults.privacyPolicy,
    termsOfService: interfaceConfig?.termsOfService ?? defaults.termsOfService,
    bookmarks: interfaceConfig?.bookmarks ?? defaults.bookmarks,
    prompts: interfaceConfig?.prompts ?? defaults.prompts,
    multiConvo: interfaceConfig?.multiConvo ?? defaults.multiConvo,
    agents: interfaceConfig?.agents ?? defaults.agents,
    temporaryChat: interfaceConfig?.temporaryChat ?? defaults.temporaryChat,
    customWelcome: interfaceConfig?.customWelcome ?? defaults.customWelcome,
  });

  await updateAccessPermissions(roleName, {
    [PermissionTypes.PROMPTS]: { [Permissions.USE]: loadedInterface.prompts },
    [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: loadedInterface.bookmarks },
    [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: loadedInterface.multiConvo },
    [PermissionTypes.AGENTS]: { [Permissions.USE]: loadedInterface.agents },
  });
  await updateAccessPermissions(SystemRoles.ADMIN, {
    [PermissionTypes.PROMPTS]: { [Permissions.USE]: loadedInterface.prompts },
    [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: loadedInterface.bookmarks },
    [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: loadedInterface.multiConvo },
    [PermissionTypes.AGENTS]: { [Permissions.USE]: loadedInterface.agents },
  });

  let i = 0;
  const logSettings = () => {
    // log interface object and model specs object (without list) for reference
    logger.warn(`\`interface\` settings:\n${JSON.stringify(loadedInterface, null, 2)}`);
    logger.warn(
      `\`modelSpecs\` settings:\n${JSON.stringify(
        { ...(config?.modelSpecs ?? {}), list: undefined },
        null,
        2,
      )}`,
    );
  };

  // warn about config.modelSpecs.prioritize if true and presets are enabled, that default presets will conflict with prioritizing model specs.
  if (config?.modelSpecs?.prioritize && loadedInterface.presets) {
    logger.warn(
      'Note: Prioritizing model specs can conflict with default presets if a default preset is set. It\'s recommended to disable presets from the interface or disable use of a default preset.',
    );
    i === 0 && i++;
  }

  // warn about config.modelSpecs.enforce if true and if any of these, endpointsMenu, modelSelect, presets, or parameters are enabled, that enforcing model specs can conflict with these options.
  if (
    config?.modelSpecs?.enforce &&
    (loadedInterface.endpointsMenu ||
      loadedInterface.modelSelect ||
      loadedInterface.presets ||
      loadedInterface.parameters)
  ) {
    logger.warn(
      'Note: Enforcing model specs can conflict with the interface options: endpointsMenu, modelSelect, presets, and parameters. It\'s recommended to disable these options from the interface or disable enforcing model specs.',
    );
    i === 0 && i++;
  }
  // warn if enforce is true and prioritize is not, that enforcing model specs without prioritizing them can lead to unexpected behavior.
  if (config?.modelSpecs?.enforce && !config?.modelSpecs?.prioritize) {
    logger.warn(
      'Note: Enforcing model specs without prioritizing them can lead to unexpected behavior. It\'s recommended to enable prioritizing model specs if enforcing them.',
    );
    i === 0 && i++;
  }

  if (i > 0) {
    logSettings();
  }

  return loadedInterface;
}

module.exports = { loadDefaultInterface };
