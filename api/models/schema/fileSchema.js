const mongoose = require('mongoose');

/**
 * @typedef {Object} MongoFile
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
 * @property {number} [width] - Optional width of the file
 * @property {number} [height] - Optional height of the file
 * @property {Date} [expiresAt] - Optional height of the file
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
    usage: {
      type: Number,
      required: true,
      default: 0,
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
    type: {
      type: String,
      required: true,
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

module.exports = fileSchema;
