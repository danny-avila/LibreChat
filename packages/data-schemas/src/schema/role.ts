import { Schema } from 'mongoose';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { IRole } from '~/types';

/**
 * Uses a sub-schema for permissions. Notice we disable `_id` for this subdocument.
 */
const rolePermissionsSchema = new Schema(
  {
    [PermissionTypes.BOOKMARKS]: {
      [Permissions.USE]: { type: Boolean, default: true },
    },
    [PermissionTypes.PROMPTS]: {
      [Permissions.SHARED_GLOBAL]: { type: Boolean, default: false },
      [Permissions.USE]: { type: Boolean, default: true },
      [Permissions.CREATE]: { type: Boolean, default: true },
    },
    [PermissionTypes.MEMORIES]: {
      [Permissions.USE]: { type: Boolean, default: true },
      [Permissions.CREATE]: { type: Boolean, default: true },
      [Permissions.UPDATE]: { type: Boolean, default: true },
      [Permissions.READ]: { type: Boolean, default: true },
      [Permissions.OPT_OUT]: { type: Boolean, default: true },
    },
    [PermissionTypes.AGENTS]: {
      [Permissions.SHARED_GLOBAL]: { type: Boolean, default: false },
      [Permissions.USE]: { type: Boolean, default: true },
      [Permissions.CREATE]: { type: Boolean, default: true },
    },
    [PermissionTypes.MULTI_CONVO]: {
      [Permissions.USE]: { type: Boolean, default: true },
    },
    [PermissionTypes.TEMPORARY_CHAT]: {
      [Permissions.USE]: { type: Boolean, default: true },
    },
    [PermissionTypes.RUN_CODE]: {
      [Permissions.USE]: { type: Boolean, default: true },
    },
    [PermissionTypes.WEB_SEARCH]: {
      [Permissions.USE]: { type: Boolean, default: true },
    },
    [PermissionTypes.FILE_SEARCH]: {
      [Permissions.USE]: { type: Boolean, default: true },
    },
    [PermissionTypes.FILE_CITATIONS]: {
      [Permissions.USE]: { type: Boolean, default: true },
    },
  },
  { _id: false },
);

const roleSchema: Schema<IRole> = new Schema({
  name: { type: String, required: true, unique: true, index: true },
  permissions: {
    type: rolePermissionsSchema,
    default: () => ({
      [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: true },
      [PermissionTypes.PROMPTS]: {
        [Permissions.SHARED_GLOBAL]: false,
        [Permissions.USE]: true,
        [Permissions.CREATE]: true,
      },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.CREATE]: true,
        [Permissions.UPDATE]: true,
        [Permissions.READ]: true,
      },
      [PermissionTypes.AGENTS]: {
        [Permissions.SHARED_GLOBAL]: false,
        [Permissions.USE]: true,
        [Permissions.CREATE]: true,
      },
      [PermissionTypes.MULTI_CONVO]: { [Permissions.USE]: true },
      [PermissionTypes.TEMPORARY_CHAT]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.FILE_CITATIONS]: { [Permissions.USE]: true },
    }),
  },
});

export default roleSchema;
