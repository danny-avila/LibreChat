import { Schema } from 'mongoose';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { IRole } from '~/types';

/**
 * Uses a sub-schema for permissions. Notice we disable `_id` for this subdocument.
 */
const rolePermissionsSchema = new Schema(
  {
    [PermissionTypes.BOOKMARKS]: {
      [Permissions.USE]: { type: Boolean },
    },
    [PermissionTypes.PROMPTS]: {
      [Permissions.SHARED_GLOBAL]: { type: Boolean },
      [Permissions.USE]: { type: Boolean },
      [Permissions.CREATE]: { type: Boolean },
    },
    [PermissionTypes.MEMORIES]: {
      [Permissions.USE]: { type: Boolean },
      [Permissions.CREATE]: { type: Boolean },
      [Permissions.UPDATE]: { type: Boolean },
      [Permissions.READ]: { type: Boolean },
      [Permissions.OPT_OUT]: { type: Boolean },
    },
    [PermissionTypes.AGENTS]: {
      [Permissions.SHARED_GLOBAL]: { type: Boolean },
      [Permissions.USE]: { type: Boolean },
      [Permissions.CREATE]: { type: Boolean },
    },
    [PermissionTypes.MULTI_CONVO]: {
      [Permissions.USE]: { type: Boolean },
    },
    [PermissionTypes.TEMPORARY_CHAT]: {
      [Permissions.USE]: { type: Boolean },
    },
    [PermissionTypes.RUN_CODE]: {
      [Permissions.USE]: { type: Boolean },
    },
    [PermissionTypes.WEB_SEARCH]: {
      [Permissions.USE]: { type: Boolean },
    },
    [PermissionTypes.PEOPLE_PICKER]: {
      [Permissions.VIEW_USERS]: { type: Boolean },
      [Permissions.VIEW_GROUPS]: { type: Boolean },
      [Permissions.VIEW_ROLES]: { type: Boolean },
    },
    [PermissionTypes.MARKETPLACE]: {
      [Permissions.USE]: { type: Boolean },
    },
    [PermissionTypes.FILE_SEARCH]: {
      [Permissions.USE]: { type: Boolean },
    },
    [PermissionTypes.FILE_CITATIONS]: {
      [Permissions.USE]: { type: Boolean },
    },
  },
  { _id: false },
);

const roleSchema: Schema<IRole> = new Schema({
  name: { type: String, required: true, unique: true, index: true },
  permissions: {
    type: rolePermissionsSchema,
  },
});

export default roleSchema;
