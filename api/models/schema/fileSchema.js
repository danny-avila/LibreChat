const { FileSources } = require('librechat-data-provider');
const mongoose = require('mongoose');

/**
 * @typedef {Object} MongoFile
 * @property {mongoose.Schema.Types.ObjectId} [_id] - MongoDB Document ID
 * @property {number} [__v] - MongoDB Version Key
 * @property {mongoose.Schema.Types.ObjectId} user - User ID
 * @property {string} [conversationId] - Optional conversation ID
 * @property {string} file_id - File identifier
 * @property {string} [temp_file_id] - Temporary File identifier
 * @property {number} bytes - Size of the file in bytes
 * @property {string} filename - Name of the file
 * @property {string} filepath - Location of the file
 * @property {'file'} object - Type of object, always 'file'
 * @property {string} type - Type of file
 * @property {number} usage - Number of uses of the file
 * @property {string} [context] - Context of the file origin
 * @property {boolean} [embedded] - Whether or not the file is embedded in vector db
 * @property {string} [model] - The model to identify the group region of the file (for Azure OpenAI hosting)
 * @property {string} [source] - The source of the file
 * @property {number} [width] - Optional width of the file
 * @property {number} [height] - Optional height of the file
 * @property {Date} [expiresAt] - Optional height of the file
 * @property {Date} [createdAt] - Date when the file was created
 * @property {Date} [updatedAt] - Date when the file was updated
 */
const fileSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    conversationId: {
      type: String,
      ref: 'Conversation',
      index: true,
    },
    file_id: {
      type: String,
      // required: true,
      index: true,
    },
    temp_file_id: {
      type: String,
      // required: true,
    },
    bytes: {
      type: Number,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    filepath: {
      type: String,
      required: true,
    },
    object: {
      type: String,
      required: true,
      default: 'file',
    },
    embedded: {
      type: Boolean,
    },
    type: {
      type: String,
      required: true,
    },
    context: {
      type: String,
      // required: true,
    },
    usage: {
      type: Number,
      required: true,
      default: 0,
    },
    source: {
      type: String,
      default: FileSources.local,
    },
    model: {
      type: String,
    },
    width: Number,
    height: Number,
    expiresAt: {
      type: Date,
      expires: 3600,
    },
  },
  {
    timestamps: true,
  },
);

fileSchema.index({ createdAt: 1, updatedAt: 1 });

module.exports = fileSchema;
