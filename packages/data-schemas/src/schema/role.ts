import { Schema, Document } from 'mongoose';
import { PermissionTypes, Permissions } from 'librechat-data-provider';

export interface IRole extends Document {
  name: string;
  [PermissionTypes.BOOKMARKS]?: {
    [Permissions.USE]?: boolean;
  };
  [PermissionTypes.PROMPTS]?: {
    [Permissions.SHARED_GLOBAL]?: boolean;
    [Permissions.USE]?: boolean;
    [Permissions.CREATE]?: boolean;
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
}

const roleSchema: Schema<IRole> = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  [PermissionTypes.BOOKMARKS]: {
    [Permissions.USE]: {
      type: Boolean,
      default: true,
    },
  },
  [PermissionTypes.PROMPTS]: {
    [Permissions.SHARED_GLOBAL]: {
      type: Boolean,
      default: false,
    },
    [Permissions.USE]: {
      type: Boolean,
      default: true,
    },
    [Permissions.CREATE]: {
      type: Boolean,
      default: true,
    },
  },
  [PermissionTypes.AGENTS]: {
    [Permissions.SHARED_GLOBAL]: {
      type: Boolean,
      default: false,
    },
    [Permissions.USE]: {
      type: Boolean,
      default: true,
    },
    [Permissions.CREATE]: {
      type: Boolean,
      default: true,
    },
  },
  [PermissionTypes.MULTI_CONVO]: {
    [Permissions.USE]: {
      type: Boolean,
      default: true,
    },
  },
  [PermissionTypes.TEMPORARY_CHAT]: {
    [Permissions.USE]: {
      type: Boolean,
      default: true,
    },
  },
  [PermissionTypes.RUN_CODE]: {
    [Permissions.USE]: {
      type: Boolean,
      default: true,
    },
  },
});

export default roleSchema;
