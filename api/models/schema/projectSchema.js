const { Schema } = require('mongoose');

/**
 * @typedef {Object} MongoProject
 * @property {ObjectId} [_id] - MongoDB Document ID
 * @property {string} name - The name of the project
 * @property {ObjectId[]} promptGroupIds - Array of PromptGroup IDs associated with the project
 * @property {Date} [createdAt] - Date when the project was created (added by timestamps)
 * @property {Date} [updatedAt] - Date when the project was last updated (added by timestamps)
 */

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    promptGroupIds: {
      type: [Schema.Types.ObjectId],
      ref: 'PromptGroup',
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

module.exports = projectSchema;
