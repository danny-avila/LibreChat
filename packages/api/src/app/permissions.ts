import { logger } from '@librechat/data-schemas';
import {
  SystemRoles,
  Permissions,
  roleDefaults,
  PermissionTypes,
  getConfigDefaults,
} from 'librechat-data-provider';
import type { IRole, AppConfig } from '@librechat/data-schemas';
import { isMemoryEnabled } from '~/memory/config';

/**
 * Checks if a permission type has explicit configuration
 */
function hasExplicitConfig(
  interfaceConfig: AppConfig['interfaceConfig'],
  permissionType: PermissionTypes,
) {
  switch (permissionType) {
    case PermissionTypes.PROMPTS:
      return interfaceConfig?.prompts !== undefined;
    case PermissionTypes.BOOKMARKS:
      return interfaceConfig?.bookmarks !== undefined;
    case PermissionTypes.MEMORIES:
      return interfaceConfig?.memories !== undefined;
    case PermissionTypes.MULTI_CONVO:
      return interfaceConfig?.multiConvo !== undefined;
    case PermissionTypes.AGENTS:
      return interfaceConfig?.agents !== undefined;
    case PermissionTypes.TEMPORARY_CHAT:
      return interfaceConfig?.temporaryChat !== undefined;
    case PermissionTypes.RUN_CODE:
      return interfaceConfig?.runCode !== undefined;
    case PermissionTypes.WEB_SEARCH:
      return interfaceConfig?.webSearch !== undefined;
    case PermissionTypes.PEOPLE_PICKER:
      return interfaceConfig?.peoplePicker !== undefined;
    case PermissionTypes.MARKETPLACE:
      return interfaceConfig?.marketplace !== undefined;
    case PermissionTypes.FILE_SEARCH:
      return interfaceConfig?.fileSearch !== undefined;
    case PermissionTypes.FILE_CITATIONS:
      return interfaceConfig?.fileCitations !== undefined;
    case PermissionTypes.MCP_SERVERS:
      return interfaceConfig?.mcpServers !== undefined;
    default:
      return false;
  }
}

export async function updateInterfacePermissions({
  appConfig,
  getRoleByName,
  updateAccessPermissions,
}: {
  appConfig: AppConfig;
  getRoleByName: (roleName: string, fieldsToSelect?: string | string[]) => Promise<IRole | null>;
  updateAccessPermissions: (
    roleName: string,
    permissionsUpdate: Partial<Record<PermissionTypes, Record<string, boolean | undefined>>>,

    roleData?: IRole | null,
  ) => Promise<void>;
}) {
  const loadedInterface = appConfig?.interfaceConfig;
  if (!loadedInterface) {
    return;
  }
  /** Configured values for interface object structure */
  const interfaceConfig = appConfig?.config?.interface;
  const memoryConfig = appConfig?.config?.memory;
  const memoryEnabled = isMemoryEnabled(memoryConfig);
  /** Check if memory is explicitly disabled (memory.disabled === true) */
  const isMemoryExplicitlyDisabled = memoryConfig?.disabled === true;
  /** Check if memory should be enabled (explicitly enabled or valid config) */
  const shouldEnableMemory =
    memoryConfig?.disabled === false ||
    (memoryConfig && memoryEnabled && memoryConfig.disabled === undefined);
  /** Check if personalization is enabled (defaults to true if memory is configured and enabled) */
  const isPersonalizationEnabled =
    memoryConfig && memoryEnabled && memoryConfig.personalize !== false;

  /** Helper to get permission value with proper precedence */
  const getPermissionValue = (
    configValue?: boolean,
    roleDefault?: boolean,
    schemaDefault?: boolean,
  ) => {
    if (configValue !== undefined) return configValue;
    if (roleDefault !== undefined) return roleDefault;
    return schemaDefault;
  };

  const defaults = getConfigDefaults().interface;

  // Permission precedence order:
  // 1. Explicit user configuration (from librechat.yaml)
  // 2. Role-specific defaults (from roleDefaults)
  // 3. Interface schema defaults (from interfaceSchema.default())
  for (const roleName of [SystemRoles.USER, SystemRoles.ADMIN]) {
    const defaultPerms = roleDefaults[roleName]?.permissions;

    const existingRole = await getRoleByName(roleName);
    const existingPermissions = existingRole?.permissions;
    const permissionsToUpdate: Partial<
      Record<PermissionTypes, Record<string, boolean | undefined>>
    > = {};

    /**
     * Helper to add permission if it should be updated
     */
    const addPermissionIfNeeded = (
      permType: PermissionTypes,
      permissions: Record<string, boolean | undefined>,
    ) => {
      const permTypeExists = existingPermissions?.[permType];
      const isExplicitlyConfigured =
        interfaceConfig && hasExplicitConfig(interfaceConfig, permType);
      const isMemoryDisabled = permType === PermissionTypes.MEMORIES && isMemoryExplicitlyDisabled;
      const isMemoryReenabling =
        permType === PermissionTypes.MEMORIES &&
        shouldEnableMemory &&
        existingPermissions?.[PermissionTypes.MEMORIES]?.[Permissions.USE] === false;

      // Only update if: doesn't exist OR explicitly configured OR memory state change
      if (!permTypeExists || isExplicitlyConfigured || isMemoryDisabled || isMemoryReenabling) {
        permissionsToUpdate[permType] = permissions;
        if (!permTypeExists) {
          logger.debug(`Role '${roleName}': Setting up default permissions for '${permType}'`);
        } else if (isExplicitlyConfigured) {
          logger.debug(`Role '${roleName}': Applying explicit config for '${permType}'`);
        } else if (isMemoryDisabled) {
          logger.debug(`Role '${roleName}': Disabling memories as memory.disabled is true`);
        } else if (isMemoryReenabling) {
          logger.debug(
            `Role '${roleName}': Re-enabling memories due to valid memory configuration`,
          );
        }
      } else {
        logger.debug(`Role '${roleName}': Preserving existing permissions for '${permType}'`);
      }
    };

    // Helper to extract value from boolean or object config
    const getConfigUse = (
      config: boolean | { use?: boolean; share?: boolean; public?: boolean } | undefined,
    ) => (typeof config === 'boolean' ? config : config?.use);
    const getConfigShare = (
      config: boolean | { use?: boolean; share?: boolean; public?: boolean } | undefined,
    ) => (typeof config === 'boolean' ? undefined : config?.share);
    const getConfigPublic = (
      config: boolean | { use?: boolean; share?: boolean; public?: boolean } | undefined,
    ) => (typeof config === 'boolean' ? undefined : config?.public);

    // Get default use values (for backward compat when config is boolean)
    const promptsDefaultUse =
      typeof defaults.prompts === 'boolean' ? defaults.prompts : defaults.prompts?.use;
    const agentsDefaultUse =
      typeof defaults.agents === 'boolean' ? defaults.agents : defaults.agents?.use;
    const promptsDefaultShare =
      typeof defaults.prompts === 'object' ? defaults.prompts?.share : undefined;
    const agentsDefaultShare =
      typeof defaults.agents === 'object' ? defaults.agents?.share : undefined;
    const promptsDefaultPublic =
      typeof defaults.prompts === 'object' ? defaults.prompts?.public : undefined;
    const agentsDefaultPublic =
      typeof defaults.agents === 'object' ? defaults.agents?.public : undefined;

    const allPermissions: Partial<Record<PermissionTypes, Record<string, boolean | undefined>>> = {
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: getPermissionValue(
          getConfigUse(loadedInterface.prompts),
          defaultPerms[PermissionTypes.PROMPTS]?.[Permissions.USE],
          promptsDefaultUse,
        ),
        [Permissions.CREATE]: getPermissionValue(
          undefined,
          defaultPerms[PermissionTypes.PROMPTS]?.[Permissions.CREATE],
          true,
        ),
        [Permissions.SHARE]: getPermissionValue(
          getConfigShare(loadedInterface.prompts),
          defaultPerms[PermissionTypes.PROMPTS]?.[Permissions.SHARE],
          promptsDefaultShare,
        ),
        [Permissions.SHARE_PUBLIC]: getPermissionValue(
          getConfigPublic(loadedInterface.prompts),
          defaultPerms[PermissionTypes.PROMPTS]?.[Permissions.SHARE_PUBLIC],
          promptsDefaultPublic,
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
        [Permissions.USE]: (() => {
          if (isMemoryExplicitlyDisabled) return false;
          if (shouldEnableMemory) return true;
          return getPermissionValue(
            loadedInterface.memories,
            defaultPerms[PermissionTypes.MEMORIES]?.[Permissions.USE],
            defaults.memories,
          );
        })(),
        ...(defaultPerms[PermissionTypes.MEMORIES]?.[Permissions.CREATE] !== undefined && {
          [Permissions.CREATE]: isMemoryExplicitlyDisabled
            ? false
            : defaultPerms[PermissionTypes.MEMORIES][Permissions.CREATE],
        }),
        ...(defaultPerms[PermissionTypes.MEMORIES]?.[Permissions.READ] !== undefined && {
          [Permissions.READ]: isMemoryExplicitlyDisabled
            ? false
            : defaultPerms[PermissionTypes.MEMORIES][Permissions.READ],
        }),
        ...(defaultPerms[PermissionTypes.MEMORIES]?.[Permissions.UPDATE] !== undefined && {
          [Permissions.UPDATE]: isMemoryExplicitlyDisabled
            ? false
            : defaultPerms[PermissionTypes.MEMORIES][Permissions.UPDATE],
        }),
        [Permissions.OPT_OUT]: isMemoryExplicitlyDisabled
          ? false
          : isPersonalizationEnabled || undefined,
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
          getConfigUse(loadedInterface.agents),
          defaultPerms[PermissionTypes.AGENTS]?.[Permissions.USE],
          agentsDefaultUse,
        ),
        [Permissions.CREATE]: getPermissionValue(
          undefined,
          defaultPerms[PermissionTypes.AGENTS]?.[Permissions.CREATE],
          true,
        ),
        [Permissions.SHARE]: getPermissionValue(
          getConfigShare(loadedInterface.agents),
          defaultPerms[PermissionTypes.AGENTS]?.[Permissions.SHARE],
          agentsDefaultShare,
        ),
        [Permissions.SHARE_PUBLIC]: getPermissionValue(
          getConfigPublic(loadedInterface.agents),
          defaultPerms[PermissionTypes.AGENTS]?.[Permissions.SHARE_PUBLIC],
          agentsDefaultPublic,
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
      [PermissionTypes.MCP_SERVERS]: {
        [Permissions.USE]: getPermissionValue(
          loadedInterface.mcpServers?.use,
          defaultPerms[PermissionTypes.MCP_SERVERS]?.[Permissions.USE],
          defaults.mcpServers?.use,
        ),
        [Permissions.CREATE]: getPermissionValue(
          loadedInterface.mcpServers?.create,
          defaultPerms[PermissionTypes.MCP_SERVERS]?.[Permissions.CREATE],
          defaults.mcpServers?.create,
        ),
        [Permissions.SHARE]: getPermissionValue(
          loadedInterface.mcpServers?.share,
          defaultPerms[PermissionTypes.MCP_SERVERS]?.[Permissions.SHARE],
          defaults.mcpServers?.share,
        ),
        [Permissions.SHARE_PUBLIC]: getPermissionValue(
          loadedInterface.mcpServers?.public,
          defaultPerms[PermissionTypes.MCP_SERVERS]?.[Permissions.SHARE_PUBLIC],
          defaults.mcpServers?.public,
        ),
      },
    };

    // Check and add each permission type if needed
    for (const [permType, permissions] of Object.entries(allPermissions)) {
      addPermissionIfNeeded(permType as PermissionTypes, permissions);
    }

    // Update permissions if any need updating
    if (Object.keys(permissionsToUpdate).length > 0) {
      await updateAccessPermissions(roleName, permissionsToUpdate, existingRole);
    }
  }
}
