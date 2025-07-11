const {
  SystemRoles,
  Permissions,
  PermissionTypes,
  isMemoryEnabled,
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
  const includesAddedEndpoints = config?.modelSpecs?.addedEndpoints?.length > 0;

  const memoryConfig = config?.memory;
  const memoryEnabled = isMemoryEnabled(memoryConfig);
  /** Only disable memories if memory config is present but disabled/invalid */
  const shouldDisableMemories = memoryConfig && !memoryEnabled;
  /** Check if personalization is enabled (defaults to true if memory is configured and enabled) */
  const isPersonalizationEnabled =
    memoryConfig && memoryEnabled && memoryConfig.personalize !== false;

  /** @type {TCustomConfig['interface']} */
  const loadedInterface = removeNullishValues({
    endpointsMenu:
      interfaceConfig?.endpointsMenu ?? (hasModelSpecs ? false : defaults.endpointsMenu),
    modelSelect:
      interfaceConfig?.modelSelect ??
      (hasModelSpecs ? includesAddedEndpoints : defaults.modelSelect),
    parameters: interfaceConfig?.parameters ?? (hasModelSpecs ? false : defaults.parameters),
    presets: interfaceConfig?.presets ?? (hasModelSpecs ? false : defaults.presets),
    sidePanel: interfaceConfig?.sidePanel ?? defaults.sidePanel,
    privacyPolicy: interfaceConfig?.privacyPolicy ?? defaults.privacyPolicy,
    termsOfService: interfaceConfig?.termsOfService ?? defaults.termsOfService,
    mcpServers: interfaceConfig?.mcpServers ?? defaults.mcpServers,
    bookmarks: interfaceConfig?.bookmarks ?? defaults.bookmarks,
    memories: shouldDisableMemories ? false : (interfaceConfig?.memories ?? defaults.memories),
    prompts: interfaceConfig?.prompts ?? defaults.prompts,
    multiConvo: interfaceConfig?.multiConvo ?? defaults.multiConvo,
    agents: interfaceConfig?.agents ?? defaults.agents,
    temporaryChat: interfaceConfig?.temporaryChat ?? defaults.temporaryChat,
    runCode: interfaceConfig?.runCode ?? defaults.runCode,
    webSearch: interfaceConfig?.webSearch ?? defaults.webSearch,
    fileSearch: interfaceConfig?.fileSearch ?? defaults.fileSearch,
    customWelcome: interfaceConfig?.customWelcome ?? defaults.customWelcome,
    peoplePicker: {
      admin: {
        users: interfaceConfig?.peoplePicker?.admin?.users ?? defaults.peoplePicker?.admin.users,
        groups: interfaceConfig?.peoplePicker?.admin?.groups ?? defaults.peoplePicker?.admin.groups,
      },
      user: {
        users: interfaceConfig?.peoplePicker?.user?.users ?? defaults.peoplePicker?.user.users,
        groups: interfaceConfig?.peoplePicker?.user?.groups ?? defaults.peoplePicker?.user.groups,
      },
    },
    marketplace: {
      admin: {
        use: interfaceConfig?.marketplace?.admin?.use ?? defaults.marketplace?.admin.use,
      },
      user: {
        use: interfaceConfig?.marketplace?.user?.use ?? defaults.marketplace?.user.use,
      },
    },
  });

  await updateAccessPermissions(roleName, {
    [PermissionTypes.PROMPTS]: { [Permissions.USE]: loadedInterface.prompts },
    [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: loadedInterface.bookmarks },
    [PermissionTypes.MEMORIES]: {
      [Permissions.USE]: loadedInterface.memories,
      [Permissions.OPT_OUT]: isPersonalizationEnabled,
    },
    [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: loadedInterface.multiConvo },
    [PermissionTypes.AGENTS]: { [Permissions.USE]: loadedInterface.agents },
    [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: loadedInterface.temporaryChat },
    [PermissionTypes.RUN_CODE]: { [Permissions.USE]: loadedInterface.runCode },
    [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: loadedInterface.webSearch },
    [PermissionTypes.PEOPLE_PICKER]: {
      [Permissions.VIEW_USERS]: loadedInterface.peoplePicker.user?.users,
      [Permissions.VIEW_GROUPS]: loadedInterface.peoplePicker.user?.groups,
    },
    [PermissionTypes.MARKETPLACE]: {
      [Permissions.USE]: loadedInterface.marketplace.user?.use,
    },
    [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: loadedInterface.fileSearch },
  });
  await updateAccessPermissions(SystemRoles.ADMIN, {
    [PermissionTypes.PROMPTS]: { [Permissions.USE]: loadedInterface.prompts },
    [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: loadedInterface.bookmarks },
    [PermissionTypes.MEMORIES]: {
      [Permissions.USE]: loadedInterface.memories,
      [Permissions.OPT_OUT]: isPersonalizationEnabled,
    },
    [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: loadedInterface.multiConvo },
    [PermissionTypes.AGENTS]: { [Permissions.USE]: loadedInterface.agents },
    [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: loadedInterface.temporaryChat },
    [PermissionTypes.RUN_CODE]: { [Permissions.USE]: loadedInterface.runCode },
    [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: loadedInterface.webSearch },
    [PermissionTypes.PEOPLE_PICKER]: {
      [Permissions.VIEW_USERS]: loadedInterface.peoplePicker.admin?.users,
      [Permissions.VIEW_GROUPS]: loadedInterface.peoplePicker.admin?.groups,
    },
    [PermissionTypes.MARKETPLACE]: {
      [Permissions.USE]: loadedInterface.marketplace.admin?.use,
    },
    [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: loadedInterface.fileSearch },
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
      "Note: Prioritizing model specs can conflict with default presets if a default preset is set. It's recommended to disable presets from the interface or disable use of a default preset.",
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
      "Note: Enforcing model specs can conflict with the interface options: endpointsMenu, modelSelect, presets, and parameters. It's recommended to disable these options from the interface or disable enforcing model specs.",
    );
    i === 0 && i++;
  }
  // warn if enforce is true and prioritize is not, that enforcing model specs without prioritizing them can lead to unexpected behavior.
  if (config?.modelSpecs?.enforce && !config?.modelSpecs?.prioritize) {
    logger.warn(
      "Note: Enforcing model specs without prioritizing them can lead to unexpected behavior. It's recommended to enable prioritizing model specs if enforcing them.",
    );
    i === 0 && i++;
  }

  if (i > 0) {
    logSettings();
  }

  return loadedInterface;
}

module.exports = { loadDefaultInterface };
