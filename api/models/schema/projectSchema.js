const { Schema } = require('mongoose');

/**
 * @typedef {Object} MemoryEntry
 * @property {string} entryId - Unique ID for the memory entry
 * @property {string} content - The memory content
 * @property {'auto'|'manual'} source - How the memory was created
 * @property {string|null} extractedFrom - messageId the memory was extracted from
 * @property {string} category - Category for organizing memory entries
 * @property {Date} createdAt - When the entry was created
 */

/**
 * @typedef {Object} MongoProject
 * @property {ObjectId} [_id] - MongoDB Document ID
 * @property {string} name - The name of the project
 * @property {string} user - The owner's user ID
 * @property {string} description - Project description
 * @property {ObjectId[]} promptGroupIds - Array of PromptGroup IDs associated with the project
 * @property {string[]} agentIds - Array of Agent IDs associated with the project
 * @property {string[]} conversationIds - Array of associated conversation IDs
 * @property {string[]} fileIds - Array of associated file IDs
 * @property {MemoryEntry[]} memoryEntries - Array of project memory entries
 * @property {boolean} isArchived - Whether the project is archived
 * @property {Date} [createdAt] - Date when the project was created (added by timestamps)
 * @property {Date} [updatedAt] - Date when the project was last updated (added by timestamps)
 */

const memoryEntrySchema = new Schema(
  {
    entryId: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'manual',
    },
    extractedFrom: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: 'general',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    user: {
      type: String,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    promptGroupIds: {
      type: [Schema.Types.ObjectId],
      ref: 'PromptGroup',
      default: [],
    },
    agentIds: {
      type: [String],
      ref: 'Agent',
      default: [],
    },
    conversationIds: {
      type: [String],
      default: [],
      index: true,
    },
    fileIds: {
      type: [String],
      default: [],
    },
    memoryEntries: {
      type: [memoryEntrySchema],
      default: [],
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

projectSchema.index({ user: 1, name: 1 }, { unique: true, partialFilterExpression: { user: { $exists: true } } });
projectSchema.index({ user: 1, isArchived: 1, updatedAt: -1 });

module.exports = projectSchema;
