const {
  SystemRoles,
  Permissions,
  roleDefaults,
  PermissionTypes,
  removeNullishValues,
} = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { isMemoryEnabled } = require('@librechat/api');
const { updateAccessPermissions, getRoleByName } = require('~/models/Role');

/**
 * Checks if a permission type has explicit configuration
 */
function hasExplicitConfig(interfaceConfig, permissionType) {
  switch (permissionType) {
    case PermissionTypes.PROMPTS:
      return interfaceConfig.prompts !== undefined;
    case PermissionTypes.BOOKMARKS:
      return interfaceConfig.bookmarks !== undefined;
    case PermissionTypes.MEMORIES:
      return interfaceConfig.memories !== undefined;
    case PermissionTypes.MULTI_CONVO:
      return interfaceConfig.multiConvo !== undefined;
    case PermissionTypes.AGENTS:
      return interfaceConfig.agents !== undefined;
    case PermissionTypes.TEMPORARY_CHAT:
      return interfaceConfig.temporaryChat !== undefined;
    case PermissionTypes.RUN_CODE:
      return interfaceConfig.runCode !== undefined;
    case PermissionTypes.WEB_SEARCH:
      return interfaceConfig.webSearch !== undefined;
    case PermissionTypes.PEOPLE_PICKER:
      return interfaceConfig.peoplePicker !== undefined;
    case PermissionTypes.MARKETPLACE:
      return interfaceConfig.marketplace !== undefined;
    case PermissionTypes.FILE_SEARCH:
      return interfaceConfig.fileSearch !== undefined;
    case PermissionTypes.FILE_CITATIONS:
      return interfaceConfig.fileCitations !== undefined;
    default:
      return false;
  }
}

/**
 * Loads the default interface object.
 * @param {TCustomConfig | undefined} config - The loaded custom configuration.
 * @param {TConfigDefaults} configDefaults - The custom configuration default values.
 * @returns {Promise<TCustomConfig['interface']>} The default interface object.
 */
async function loadDefaultInterface(config, configDefaults) {
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
    // UI elements - use schema defaults
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
    customWelcome: interfaceConfig?.customWelcome ?? defaults.customWelcome,
    defaultPinMcp: interfaceConfig?.defaultPinMcp ?? defaults.defaultPinMcp,

    // Permissions - only include if explicitly configured
    bookmarks: interfaceConfig?.bookmarks,
    memories: shouldDisableMemories ? false : interfaceConfig?.memories,
    prompts: interfaceConfig?.prompts,
    multiConvo: interfaceConfig?.multiConvo,
    agents: interfaceConfig?.agents,
    temporaryChat: interfaceConfig?.temporaryChat,
    runCode: interfaceConfig?.runCode,
    webSearch: interfaceConfig?.webSearch,
    fileSearch: interfaceConfig?.fileSearch,
    fileCitations: interfaceConfig?.fileCitations,
    peoplePicker: interfaceConfig?.peoplePicker,
    marketplace: interfaceConfig?.marketplace,
  });

  // Helper to get permission value with proper precedence
  const getPermissionValue = (configValue, roleDefault, schemaDefault) => {
    if (configValue !== undefined) return configValue;
    if (roleDefault !== undefined) return roleDefault;
    return schemaDefault;
  };

  // Permission precedence order:
  // 1. Explicit user configuration (from librechat.yaml)
  // 2. Role-specific defaults (from roleDefaults)
  // 3. Interface schema defaults (from interfaceSchema.default())
  for (const roleName of [SystemRoles.USER, SystemRoles.ADMIN]) {
    const defaultPerms = roleDefaults[roleName].permissions;
    const existingRole = await getRoleByName(roleName);
    const existingPermissions = existingRole?.permissions || {};
    const permissionsToUpdate = {};

    // Helper to add permission if it should be updated
    const addPermissionIfNeeded = (permType, permissions) => {
      const permTypeExists = existingPermissions[permType];
      const isExplicitlyConfigured =
        interfaceConfig && hasExplicitConfig(interfaceConfig, permType);

      // Only update if: doesn't exist OR explicitly configured
      if (!permTypeExists || isExplicitlyConfigured) {
        permissionsToUpdate[permType] = permissions;
        if (!permTypeExists) {
          logger.debug(`Role '${roleName}': Setting up default permissions for '${permType}'`);
        } else if (isExplicitlyConfigured) {
          logger.debug(`Role '${roleName}': Applying explicit config for '${permType}'`);
        }
      } else {
        logger.debug(`Role '${roleName}': Preserving existing permissions for '${permType}'`);
      }
    };

    // Build permissions for each type
    const allPermissions = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.prompts,
          defaultPerms[PermissionTypes.PROMPTS]?.[Permissions.USE],
          defaults.prompts,
        ),
      },
      [PermissionTypes.BOOKMARKS]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.bookmarks,
          defaultPerms[PermissionTypes.BOOKMARKS]?.[Permissions.USE],
          defaults.bookmarks,
        ),
      },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.memories,
          defaultPerms[PermissionTypes.MEMORIES]?.[Permissions.USE],
          defaults.memories,
        ),
        [Permissions.OPT_OUT]: isPersonalizationEnabled,
      },
      [PermissionTypes.MULTI_CONVO]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.multiConvo,
          defaultPerms[PermissionTypes.MULTI_CONVO]?.[Permissions.USE],
          defaults.multiConvo,
        ),
      },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.agents,
          defaultPerms[PermissionTypes.AGENTS]?.[Permissions.USE],
          defaults.agents,
        ),
      },
      [PermissionTypes.TEMPORARY_CHAT]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.temporaryChat,
          defaultPerms[PermissionTypes.TEMPORARY_CHAT]?.[Permissions.USE],
          defaults.temporaryChat,
        ),
      },
      [PermissionTypes.RUN_CODE]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.runCode,
          defaultPerms[PermissionTypes.RUN_CODE]?.[Permissions.USE],
          defaults.runCode,
        ),
      },
      [PermissionTypes.WEB_SEARCH]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.webSearch,
          defaultPerms[PermissionTypes.WEB_SEARCH]?.[Permissions.USE],
          defaults.webSearch,
        ),
      },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: getPermissionValue(
          loadedInterface.peoplePicker?.users,
          defaultPerms[PermissionTypes.PEOPLE_PICKER]?.[Permissions.VIEW_USERS],
          defaults.peoplePicker?.users,
        ),
        [Permissions.VIEW_GROUPS]: getPermissionValue(
          loadedInterface.peoplePicker?.groups,
          defaultPerms[PermissionTypes.PEOPLE_PICKER]?.[Permissions.VIEW_GROUPS],
          defaults.peoplePicker?.groups,
        ),
        [Permissions.VIEW_ROLES]: getPermissionValue(
          loadedInterface.peoplePicker?.roles,
          defaultPerms[PermissionTypes.PEOPLE_PICKER]?.[Permissions.VIEW_ROLES],
          defaults.peoplePicker?.roles,
        ),
      },
      [PermissionTypes.MARKETPLACE]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.marketplace?.use,
          defaultPerms[PermissionTypes.MARKETPLACE]?.[Permissions.USE],
          defaults.marketplace?.use,
        ),
      },
      [PermissionTypes.FILE_SEARCH]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.fileSearch,
          defaultPerms[PermissionTypes.FILE_SEARCH]?.[Permissions.USE],
          defaults.fileSearch,
        ),
      },
      [PermissionTypes.FILE_CITATIONS]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.fileCitations,
          defaultPerms[PermissionTypes.FILE_CITATIONS]?.[Permissions.USE],
          defaults.fileCitations,
        ),
      },
    };

    // Check and add each permission type if needed
    for (const [permType, permissions] of Object.entries(allPermissions)) {
      addPermissionIfNeeded(permType, permissions);
    }

    // Update permissions if any need updating
    if (Object.keys(permissionsToUpdate).length > 0) {
      await updateAccessPermissions(roleName, permissionsToUpdate, existingRole);
    }
  }

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
