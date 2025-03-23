import { z } from 'zod';
import {
  Permissions,
  PermissionTypes,
  agentPermissionsSchema,
  promptPermissionsSchema,
  runCodePermissionsSchema,
  bookmarkPermissionsSchema,
  multiConvoPermissionsSchema,
  temporaryChatPermissionsSchema,
} from './permissions';

/**
 * Enum for System Defined Roles
 */
export enum SystemRoles {
  /**
   * The Admin role
   */
  ADMIN = 'ADMIN',
  /**
   * The default user role
   */
  USER = 'USER',
}

export const roleSchema = z.object({
  name: z.string(),
  [PermissionTypes.PROMPTS]: promptPermissionsSchema,
  [PermissionTypes.BOOKMARKS]: bookmarkPermissionsSchema,
  [PermissionTypes.AGENTS]: agentPermissionsSchema,
  [PermissionTypes.MULTI_CONVO]: multiConvoPermissionsSchema,
  [PermissionTypes.TEMPORARY_CHAT]: temporaryChatPermissionsSchema,
  [PermissionTypes.RUN_CODE]: runCodePermissionsSchema,
});

export type TRole = z.infer<typeof roleSchema>;
export type TAgentPermissions = z.infer<typeof agentPermissionsSchema>;
export type TPromptPermissions = z.infer<typeof promptPermissionsSchema>;
export type TBookmarkPermissions = z.infer<typeof bookmarkPermissionsSchema>;
export type TMultiConvoPermissions = z.infer<typeof multiConvoPermissionsSchema>;
export type TTemporaryChatPermissions = z.infer<typeof temporaryChatPermissionsSchema>;
export type TRunCodePermissions = z.infer<typeof runCodePermissionsSchema>;

const defaultRolesSchema = z.object({
  [SystemRoles.ADMIN]: roleSchema.extend({
    name: z.literal(SystemRoles.ADMIN),
    [PermissionTypes.PROMPTS]: promptPermissionsSchema.extend({
      [Permissions.SHARED_GLOBAL]: z.boolean().default(true),
      [Permissions.USE]: z.boolean().default(true),
      [Permissions.CREATE]: z.boolean().default(true),
      // [Permissions.SHARE]: z.boolean().default(true),
    }),
    [PermissionTypes.BOOKMARKS]: bookmarkPermissionsSchema.extend({
      [Permissions.USE]: z.boolean().default(true),
    }),
    [PermissionTypes.AGENTS]: agentPermissionsSchema.extend({
      [Permissions.SHARED_GLOBAL]: z.boolean().default(true),
      [Permissions.USE]: z.boolean().default(true),
      [Permissions.CREATE]: z.boolean().default(true),
      // [Permissions.SHARE]: z.boolean().default(true),
    }),
    [PermissionTypes.MULTI_CONVO]: multiConvoPermissionsSchema.extend({
      [Permissions.USE]: z.boolean().default(true),
    }),
    [PermissionTypes.TEMPORARY_CHAT]: temporaryChatPermissionsSchema.extend({
      [Permissions.USE]: z.boolean().default(true),
    }),
    [PermissionTypes.RUN_CODE]: runCodePermissionsSchema.extend({
      [Permissions.USE]: z.boolean().default(true),
    }),
  }),
  [SystemRoles.USER]: roleSchema.extend({
    name: z.literal(SystemRoles.USER),
    [PermissionTypes.PROMPTS]: promptPermissionsSchema,
    [PermissionTypes.BOOKMARKS]: bookmarkPermissionsSchema,
    [PermissionTypes.AGENTS]: agentPermissionsSchema,
    [PermissionTypes.MULTI_CONVO]: multiConvoPermissionsSchema,
    [PermissionTypes.TEMPORARY_CHAT]: temporaryChatPermissionsSchema,
    [PermissionTypes.RUN_CODE]: runCodePermissionsSchema,
  }),
});

export const roleDefaults = defaultRolesSchema.parse({
  [SystemRoles.ADMIN]: {
    name: SystemRoles.ADMIN,
    [PermissionTypes.PROMPTS]: {},
    [PermissionTypes.BOOKMARKS]: {},
    [PermissionTypes.AGENTS]: {},
    [PermissionTypes.MULTI_CONVO]: {},
    [PermissionTypes.TEMPORARY_CHAT]: {},
    [PermissionTypes.RUN_CODE]: {},
  },
  [SystemRoles.USER]: {
    name: SystemRoles.USER,
    [PermissionTypes.PROMPTS]: {},
    [PermissionTypes.BOOKMARKS]: {},
    [PermissionTypes.AGENTS]: {},
    [PermissionTypes.MULTI_CONVO]: {},
    [PermissionTypes.TEMPORARY_CHAT]: {},
    [PermissionTypes.RUN_CODE]: {},
  },
});
