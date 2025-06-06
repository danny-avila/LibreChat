import { Document } from 'mongoose';
import { PermissionTypes, Permissions } from 'librechat-data-provider';

export interface IRole extends Document {
  name: string;
  permissions: {
    [PermissionTypes.BOOKMARKS]?: {
      [Permissions.USE]?: boolean;
    };
    [PermissionTypes.PROMPTS]?: {
      [Permissions.SHARED_GLOBAL]?: boolean;
      [Permissions.USE]?: boolean;
      [Permissions.CREATE]?: boolean;
    };
    [PermissionTypes.MEMORIES]?: {
      [Permissions.USE]?: boolean;
      [Permissions.CREATE]?: boolean;
      [Permissions.UPDATE]?: boolean;
      [Permissions.READ]?: boolean;
    };
    [PermissionTypes.AGENTS]?: {
      [Permissions.SHARED_GLOBAL]?: boolean;
      [Permissions.USE]?: boolean;
      [Permissions.CREATE]?: boolean;
    };
    [PermissionTypes.MULTI_CONVO]?: {
      [Permissions.USE]?: boolean;
    };
    [PermissionTypes.TEMPORARY_CHAT]?: {
      [Permissions.USE]?: boolean;
    };
    [PermissionTypes.RUN_CODE]?: {
      [Permissions.USE]?: boolean;
    };
    [PermissionTypes.WEB_SEARCH]?: {
      [Permissions.USE]?: boolean;
    };
  };
}
