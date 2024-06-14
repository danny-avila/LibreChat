const mongoose = require('mongoose');
const fileSchema = require('./schema/fileSchema');

const File = mongoose.model('File', fileSchema);

/**
 * Finds a file by its file_id with additional query options.
 * @param {string} file_id - The unique identifier of the file.
 * @param {object} options - Query options for filtering, projection, etc.
 * @returns {Promise<MongoFile>} A promise that resolves to the file document or null.
 */
const findFileById = async (file_id, options = {}) => {
  return await File.findOne({ file_id, ...options }).lean();
};

/**
 * Retrieves files matching a given filter, sorted by the most recently updated.
 * @param {Object} filter - The filter criteria to apply.
 * @param {Object} [_sortOptions] - Optional sort parameters.
 * @returns {Promise<Array<MongoFile>>} A promise that resolves to an array of file documents.
 */
const getFiles = async (filter, _sortOptions) => {
  const sortOptions = { updatedAt: -1, ..._sortOptions };
  return await File.find(filter).sort(sortOptions).lean();
};

/**
 * Creates a new file with a TTL of 1 hour.
 * @param {MongoFile} data - The file data to be created, must contain file_id.
 * @param {boolean} disableTTL - Whether to disable the TTL.
 * @returns {Promise<MongoFile>} A promise that resolves to the created file document.
 */
const createFile = async (data, disableTTL) => {
  const fileData = {
    ...data,
    expiresAt: new Date(Date.now() + 3600 * 1000),
  };

  if (disableTTL) {
    delete fileData.expiresAt;
  }

  return await File.findOneAndUpdate({ file_id: data.file_id }, fileData, {
    new: true,
    upsert: true,
  }).lean();
};

/**
 * Updates a file identified by file_id with new data and removes the TTL.
 * @param {MongoFile} data - The data to update, must contain file_id.
 * @returns {Promise<MongoFile>} A promise that resolves to the updated file document.
 */
const updateFile = async (data) => {
  const { file_id, ...update } = data;
  const updateOperation = {
    $set: update,
    $unset: { expiresAt: '' }, // Remove the expiresAt field to prevent TTL
  };
  return await File.findOneAndUpdate({ file_id }, updateOperation, { new: true }).lean();
};

/**
 * Increments the usage of a file identified by file_id.
 * @param {MongoFile} data - The data to update, must contain file_id and the increment value for usage.
 * @returns {Promise<MongoFile>} A promise that resolves to the updated file document.
 */
const updateFileUsage = async (data) => {
  const { file_id, inc = 1 } = data;
  const updateOperation = {
    $inc: { usage: inc },
    $unset: { expiresAt: '', temp_file_id: '' },
  };
  return await File.findOneAndUpdate({ file_id }, updateOperation, { new: true }).lean();
};

/**
 * Deletes a file identified by file_id.
 * @param {string} file_id - The unique identifier of the file to delete.
 * @returns {Promise<MongoFile>} A promise that resolves to the deleted file document or null.
 */
const deleteFile = async (file_id) => {
  return await File.findOneAndDelete({ file_id }).lean();
};

/**
 * Deletes a file identified by a filter.
 * @param {object} filter - The filter criteria to apply.
 * @returns {Promise<MongoFile>} A promise that resolves to the deleted file document or null.
 */
const deleteFileByFilter = async (filter) => {
  return await File.findOneAndDelete(filter).lean();
};

/**
 * Deletes multiple files identified by an array of file_ids.
 * @param {Array<string>} file_ids - The unique identifiers of the files to delete.
 * @returns {Promise<Object>} A promise that resolves to the result of the deletion operation.
 */
const deleteFiles = async (file_ids, user) => {
  let deleteQuery = { file_id: { $in: file_ids } };
  if (user) {
    deleteQuery = { user: user };
  }
  return await File.deleteMany(deleteQuery);
};

module.exports = {
  File,
  findFileById,
  getFiles,
  createFile,
  updateFile,
  updateFileUsage,
  deleteFile,
  deleteFiles,
  deleteFileByFilter,
};
