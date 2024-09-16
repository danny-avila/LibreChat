const { PermissionTypes, Permissions } = require('librechat-data-provider');
const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
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
});

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
