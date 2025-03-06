const mongoose = require('mongoose');

/**
 * @typedef {Object} MongoGroup
 * @property {ObjectId} [_id] - MongoDB Document ID
 * @property {string} name - The group's name
 * @property {string} [description] - A brief description of the group
 * @property {string} [externalId] - External identifier for the group (required for non-local groups)
 * @property {string} provider - The provider of the group. Defaults to 'local'. For external groups (e.g., 'openid') the externalId is required.
 * @property {Date} [createdAt] - Date when the group was created (added by timestamps)
 * @property {Date} [updatedAt] - Date when the group was last updated (added by timestamps)
 */
const groupSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
    },
    externalId: {
      type: String,
      unique: true,
      required: function () {
        return this.provider !== 'local';
      },
    },
    provider: {
      type: String,
      required: true,
      default: 'local',
      enum: ['local', 'openid'],
    },
  },

  { timestamps: true },
);

module.exports = groupSchema;