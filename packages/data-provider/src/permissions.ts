import { z } from 'zod';

/**
 * Enum for Permission Types
 */
export enum PermissionTypes {
  /**
   * Type for Prompt Permissions
   */
  PROMPTS = 'PROMPTS',
  /**
   * Type for Bookmark Permissions
   */
  BOOKMARKS = 'BOOKMARKS',
  /**
   * Type for Agent Permissions
   */
  AGENTS = 'AGENTS',
  /**
   * Type for Memory Permissions
   */
  MEMORIES = 'MEMORIES',
  /**
   * Type for Multi-Conversation Permissions
   */
  MULTI_CONVO = 'MULTI_CONVO',
  /**
   * Type for Temporary Chat
   */
  TEMPORARY_CHAT = 'TEMPORARY_CHAT',
  /**
   * Type for using the "Run Code" LC Code Interpreter API feature
   */
  RUN_CODE = 'RUN_CODE',
  /**
   * Type for using the "Web Search" feature
   */
  WEB_SEARCH = 'WEB_SEARCH',
  /**
   * Type for People Picker Permissions
   */
  PEOPLE_PICKER = 'PEOPLE_PICKER',
  /**
   * Type for Marketplace Permissions
   */
  MARKETPLACE = 'MARKETPLACE',
  /**
   * Type for using the "File Search" feature
   */
  FILE_SEARCH = 'FILE_SEARCH',
  /**
   * Type for using the "File Citations" feature in agents
   */
  FILE_CITATIONS = 'FILE_CITATIONS',
  /**
   * Type for MCP Server Permissions
   */
  MCP_SERVERS = 'MCP_SERVERS',
  /**
   * Type for Remote Agent (API) Permissions
   */
  REMOTE_AGENTS = 'REMOTE_AGENTS',
  /**
   * Type for Skill Permissions
   */
  SKILLS = 'SKILLS',
}

/**
 * Maps PermissionTypes to their corresponding `interface` config field names.
 * Used to identify which interface fields seed role permissions at startup
 * and must NOT be overridden via DB config (use the role permissions editor instead).
 */
export const PERMISSION_TYPE_INTERFACE_FIELDS: Record<PermissionTypes, string> = {
  [PermissionTypes.PROMPTS]: 'prompts',
  [PermissionTypes.AGENTS]: 'agents',
  [PermissionTypes.BOOKMARKS]: 'bookmarks',
  [PermissionTypes.MEMORIES]: 'memories',
  [PermissionTypes.MULTI_CONVO]: 'multiConvo',
  [PermissionTypes.TEMPORARY_CHAT]: 'temporaryChat',
  [PermissionTypes.RUN_CODE]: 'runCode',
  [PermissionTypes.WEB_SEARCH]: 'webSearch',
  [PermissionTypes.FILE_SEARCH]: 'fileSearch',
  [PermissionTypes.FILE_CITATIONS]: 'fileCitations',
  [PermissionTypes.PEOPLE_PICKER]: 'peoplePicker',
  [PermissionTypes.MARKETPLACE]: 'marketplace',
  [PermissionTypes.MCP_SERVERS]: 'mcpServers',
  [PermissionTypes.REMOTE_AGENTS]: 'remoteAgents',
  [PermissionTypes.SKILLS]: 'skills',
};

/** Set of interface config field names that correspond to role permissions. */
export const INTERFACE_PERMISSION_FIELDS = new Set(Object.values(PERMISSION_TYPE_INTERFACE_FIELDS));

/**
 * Interface fields that may be overridden via tenant / group / user config profiles.
 * Unlike other permission fields, these are resolved through the config hierarchy
 * rather than the role permissions editor.
 */
export const SCOPE_OVERRIDE_INTERFACE_FIELDS = new Set(['skills', 'prompts']);

export type InterfacePermissionConfig =
  | boolean
  | {
      use?: boolean;
      create?: boolean;
      share?: boolean;
      public?: boolean;
      defaultActiveOnShare?: boolean;
    }
  | undefined;

/**
 * YAML sub-keys within composite interface permission fields that map to permission bits.
 * When an interface permission field is an object, only these sub-keys are stripped from
 * DB overrides — other sub-keys (like `placeholder`, `trustCheckbox`) are UI-only and pass through.
 *
 * Mapping to Permissions enum:
 *   'use'    → Permissions.USE       (agents, prompts, mcpServers, remoteAgents, marketplace)
 *   'create' → Permissions.CREATE    (agents, prompts, mcpServers, remoteAgents)
 *   'share'  → Permissions.SHARE     (agents, prompts, mcpServers, remoteAgents)
 *   'public' → Permissions.SHARE_PUBLIC (agents, prompts, mcpServers, remoteAgents)
 *   'users'  → Permissions.VIEW_USERS   (peoplePicker only)
 *   'groups' → Permissions.VIEW_GROUPS  (peoplePicker only)
 *   'roles'  → Permissions.VIEW_ROLES   (peoplePicker only)
 */
export const PERMISSION_SUB_KEYS = new Set([
  'use',
  'create',
  'share',
  'public',
  'users',
  'groups',
  'roles',
]);

/**
 * Enum for Role-Based Access Control Constants
 */
export enum Permissions {
  USE = 'USE',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  READ = 'READ',
  READ_AUTHOR = 'READ_AUTHOR',
  SHARE = 'SHARE',
  /** Can disable if desired */
  OPT_OUT = 'OPT_OUT',
  VIEW_USERS = 'VIEW_USERS',
  VIEW_GROUPS = 'VIEW_GROUPS',
  VIEW_ROLES = 'VIEW_ROLES',
  /** Can share resources publicly (with everyone) */
  SHARE_PUBLIC = 'SHARE_PUBLIC',
}

const INTERFACE_PERMISSION_SUB_KEYS: Partial<
  Record<Permissions, 'use' | 'create' | 'share' | 'public'>
> = {
  [Permissions.USE]: 'use',
  [Permissions.CREATE]: 'create',
  [Permissions.SHARE]: 'share',
  [Permissions.SHARE_PUBLIC]: 'public',
};

/** Permissions on `skills` / `prompts` that may be overridden via config hierarchy. */
export const SCOPE_OVERRIDE_PERMISSION_BITS = new Set<Permissions>([
  Permissions.USE,
  Permissions.CREATE,
  Permissions.SHARE,
  Permissions.SHARE_PUBLIC,
]);

/** Mirrors backend `getConfigUse` — extracts the USE bit from an interface permission field. */
export function getInterfacePermissionUse(config: InterfacePermissionConfig): boolean | undefined {
  return getInterfacePermissionBit(config, Permissions.USE);
}

/**
 * Extracts a permission bit from a merged `interface.skills` / `interface.prompts` value.
 * Boolean `false` blocks every bit; boolean `true` only sets USE and defers other bits to role.
 */
export function getInterfacePermissionBit(
  config: InterfacePermissionConfig,
  permission: Permissions,
): boolean | undefined {
  if (config === undefined) {
    return undefined;
  }
  if (typeof config === 'boolean') {
    if (permission === Permissions.USE) {
      return config;
    }
    return config ? undefined : false;
  }
  const subKey = INTERFACE_PERMISSION_SUB_KEYS[permission];
  if (!subKey) {
    return undefined;
  }
  return config[subKey];
}

/**
 * Resolves a single permission bit using merged interface config for skills/prompts,
 * matching client `useScopeOverrideFeatureAccess`: explicit false blocks, explicit true
 * allows, absent bits defer to role permissions.
 */
export function resolveScopeOverridePermission(
  roleAllowed: boolean,
  permissionType: PermissionTypes,
  permission: Permissions,
  interfaceConfig?: Partial<Pick<Record<string, InterfacePermissionConfig>, 'skills' | 'prompts'>>,
): boolean {
  const field = PERMISSION_TYPE_INTERFACE_FIELDS[permissionType];
  if (!SCOPE_OVERRIDE_INTERFACE_FIELDS.has(field)) {
    return roleAllowed;
  }
  if (!SCOPE_OVERRIDE_PERMISSION_BITS.has(permission)) {
    return roleAllowed;
  }
  if (!interfaceConfig) {
    return roleAllowed;
  }
  const value = interfaceConfig[field as 'skills' | 'prompts'];
  const configBit = getInterfacePermissionBit(value, permission);
  if (configBit === false) {
    return false;
  }
  if (configBit === true) {
    return true;
  }
  return roleAllowed;
}

/**
 * Whether a permission bit is enabled for a scope-override field in the merged startup config.
 * Explicit `false` blocks; absent bits defer to role permissions (`true` here).
 */
export function isInterfacePermissionEnabled(
  config: InterfacePermissionConfig,
  permission: Permissions = Permissions.USE,
): boolean {
  return getInterfacePermissionBit(config, permission) !== false;
}

/**
 * Whether USE is enabled for a scope-override field (`skills`, `prompts`) in the merged
 * startup interface config. Absent fields defer to role permissions (`true` here).
 */
export function isInterfacePermissionUseEnabled(config: InterfacePermissionConfig): boolean {
  return isInterfacePermissionEnabled(config, Permissions.USE);
}

export const promptPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
  [Permissions.CREATE]: z.boolean().default(true),
  [Permissions.SHARE]: z.boolean().default(false),
  [Permissions.SHARE_PUBLIC]: z.boolean().default(false),
});
export type TPromptPermissions = z.infer<typeof promptPermissionsSchema>;

export const bookmarkPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
});
export type TBookmarkPermissions = z.infer<typeof bookmarkPermissionsSchema>;

export const memoryPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
  [Permissions.CREATE]: z.boolean().default(true),
  [Permissions.UPDATE]: z.boolean().default(true),
  [Permissions.READ]: z.boolean().default(true),
  [Permissions.OPT_OUT]: z.boolean().default(true),
});
export type TMemoryPermissions = z.infer<typeof memoryPermissionsSchema>;

export const agentPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
  [Permissions.CREATE]: z.boolean().default(true),
  [Permissions.SHARE]: z.boolean().default(false),
  [Permissions.SHARE_PUBLIC]: z.boolean().default(false),
});
export type TAgentPermissions = z.infer<typeof agentPermissionsSchema>;

export const multiConvoPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
});
export type TMultiConvoPermissions = z.infer<typeof multiConvoPermissionsSchema>;

export const temporaryChatPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
});
export type TTemporaryChatPermissions = z.infer<typeof temporaryChatPermissionsSchema>;

export const runCodePermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
});
export type TRunCodePermissions = z.infer<typeof runCodePermissionsSchema>;

export const webSearchPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
});
export type TWebSearchPermissions = z.infer<typeof webSearchPermissionsSchema>;

export const peoplePickerPermissionsSchema = z.object({
  [Permissions.VIEW_USERS]: z.boolean().default(true),
  [Permissions.VIEW_GROUPS]: z.boolean().default(true),
  [Permissions.VIEW_ROLES]: z.boolean().default(true),
});
export type TPeoplePickerPermissions = z.infer<typeof peoplePickerPermissionsSchema>;

export const marketplacePermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(false),
});
export type TMarketplacePermissions = z.infer<typeof marketplacePermissionsSchema>;

export const fileSearchPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
});
export type TFileSearchPermissions = z.infer<typeof fileSearchPermissionsSchema>;

export const fileCitationsPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
});
export type TFileCitationsPermissions = z.infer<typeof fileCitationsPermissionsSchema>;

export const mcpServersPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
  [Permissions.CREATE]: z.boolean().default(true),
  [Permissions.SHARE]: z.boolean().default(false),
  [Permissions.SHARE_PUBLIC]: z.boolean().default(false),
});
export type TMcpServersPermissions = z.infer<typeof mcpServersPermissionsSchema>;

export const remoteAgentsPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(false),
  [Permissions.CREATE]: z.boolean().default(false),
  [Permissions.SHARE]: z.boolean().default(false),
  [Permissions.SHARE_PUBLIC]: z.boolean().default(false),
});
export type TRemoteAgentsPermissions = z.infer<typeof remoteAgentsPermissionsSchema>;

export const skillPermissionsSchema = z.object({
  [Permissions.USE]: z.boolean().default(true),
  [Permissions.CREATE]: z.boolean().default(true),
  [Permissions.SHARE]: z.boolean().default(false),
  [Permissions.SHARE_PUBLIC]: z.boolean().default(false),
});
export type TSkillPermissions = z.infer<typeof skillPermissionsSchema>;

// Define a single permissions schema that holds all permission types.
export const permissionsSchema = z.object({
  [PermissionTypes.PROMPTS]: promptPermissionsSchema,
  [PermissionTypes.BOOKMARKS]: bookmarkPermissionsSchema,
  [PermissionTypes.MEMORIES]: memoryPermissionsSchema,
  [PermissionTypes.AGENTS]: agentPermissionsSchema,
  [PermissionTypes.MULTI_CONVO]: multiConvoPermissionsSchema,
  [PermissionTypes.TEMPORARY_CHAT]: temporaryChatPermissionsSchema,
  [PermissionTypes.RUN_CODE]: runCodePermissionsSchema,
  [PermissionTypes.WEB_SEARCH]: webSearchPermissionsSchema,
  [PermissionTypes.PEOPLE_PICKER]: peoplePickerPermissionsSchema,
  [PermissionTypes.MARKETPLACE]: marketplacePermissionsSchema,
  [PermissionTypes.FILE_SEARCH]: fileSearchPermissionsSchema,
  [PermissionTypes.FILE_CITATIONS]: fileCitationsPermissionsSchema,
  [PermissionTypes.MCP_SERVERS]: mcpServersPermissionsSchema,
  [PermissionTypes.REMOTE_AGENTS]: remoteAgentsPermissionsSchema,
  [PermissionTypes.SKILLS]: skillPermissionsSchema,
});
