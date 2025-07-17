const { logger } = require('@librechat/data-schemas');
const { EToolResources, FileContext, Constants } = require('librechat-data-provider');
const { getProjectByName } = require('./Project');
const { getAgent } = require('./Agent');
const { File } = require('~/db/models');

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
 * Checks if a user has access to multiple files through a shared agent (batch operation)
 * @param {string} userId - The user ID to check access for
 * @param {string[]} fileIds - Array of file IDs to check
 * @param {string} agentId - The agent ID that might grant access
 * @returns {Promise<Map<string, boolean>>} Map of fileId to access status
 */
const hasAccessToFilesViaAgent = async (userId, fileIds, agentId, checkCollaborative = true) => {
  const accessMap = new Map();

  // Initialize all files as no access
  fileIds.forEach((fileId) => accessMap.set(fileId, false));

  try {
    const agent = await getAgent({ id: agentId });

    if (!agent) {
      return accessMap;
    }

    // Check if user is the author - if so, grant access to all files
    if (agent.author.toString() === userId) {
      fileIds.forEach((fileId) => accessMap.set(fileId, true));
      return accessMap;
    }

    // Check if agent is shared with the user via projects
    if (!agent.projectIds || agent.projectIds.length === 0) {
      return accessMap;
    }

    // Check if agent is in global project
    const globalProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, '_id');
    if (
      !globalProject ||
      !agent.projectIds.some((pid) => pid.toString() === globalProject._id.toString())
    ) {
      return accessMap;
    }

    // Agent is globally shared - check if it's collaborative
    if (checkCollaborative && !agent.isCollaborative) {
      return accessMap;
    }

    // Check which files are actually attached
    const attachedFileIds = new Set();
    if (agent.tool_resources) {
      for (const [_resourceType, resource] of Object.entries(agent.tool_resources)) {
        if (resource?.file_ids && Array.isArray(resource.file_ids)) {
          resource.file_ids.forEach((fileId) => attachedFileIds.add(fileId));
        }
      }
    }

    // Grant access only to files that are attached to this agent
    fileIds.forEach((fileId) => {
      if (attachedFileIds.has(fileId)) {
        accessMap.set(fileId, true);
      }
    });

    return accessMap;
  } catch (error) {
    logger.error('[hasAccessToFilesViaAgent] Error checking file access:', error);
    return accessMap;
  }
};

/**
 * Retrieves files matching a given filter, sorted by the most recently updated.
 * @param {Object} filter - The filter criteria to apply.
 * @param {Object} [_sortOptions] - Optional sort parameters.
 * @param {Object|String} [selectFields={ text: 0 }] - Fields to include/exclude in the query results.
 *                                                   Default excludes the 'text' field.
 * @param {Object} [options] - Additional options
 * @param {string} [options.userId] - User ID for access control
 * @param {string} [options.agentId] - Agent ID that might grant access to files
 * @returns {Promise<Array<MongoFile>>} A promise that resolves to an array of file documents.
 */
const getFiles = async (filter, _sortOptions, selectFields = { text: 0 }, options = {}) => {
  const sortOptions = { updatedAt: -1, ..._sortOptions };
  const files = await File.find(filter).select(selectFields).sort(sortOptions).lean();

  // If userId and agentId are provided, filter files based on access
  if (options.userId && options.agentId) {
    // Collect file IDs that need access check
    const filesToCheck = [];
    const ownedFiles = [];

    for (const file of files) {
      if (file.user && file.user.toString() === options.userId) {
        ownedFiles.push(file);
      } else {
        filesToCheck.push(file);
      }
    }

    if (filesToCheck.length === 0) {
      return ownedFiles;
    }

    // Batch check access for all non-owned files
    const fileIds = filesToCheck.map((f) => f.file_id);
    const accessMap = await hasAccessToFilesViaAgent(
      options.userId,
      fileIds,
      options.agentId,
      false,
    );

    // Filter files based on access
    const accessibleFiles = filesToCheck.filter((file) => accessMap.get(file.file_id));

    return [...ownedFiles, ...accessibleFiles];
  }

  return files;
};

/**
 * Retrieves tool files (files that are embedded or have a fileIdentifier) from an array of file IDs
 * @param {string[]} fileIds - Array of file_id strings to search for
 * @param {Set<EToolResources>} toolResourceSet - Optional filter for tool resources
 * @returns {Promise<Array<MongoFile>>} Files that match the criteria
 */
const getToolFilesByIds = async (fileIds, toolResourceSet) => {
  if (!fileIds || !fileIds.length || !toolResourceSet?.size) {
    return [];
  }

  try {
    const filter = {
      file_id: { $in: fileIds },
      $or: [],
    };

    if (toolResourceSet.has(EToolResources.ocr)) {
      filter.$or.push({ text: { $exists: true, $ne: null }, context: FileContext.agents });
    }
    if (toolResourceSet.has(EToolResources.file_search)) {
      filter.$or.push({ embedded: true });
    }
    if (toolResourceSet.has(EToolResources.execute_code)) {
      filter.$or.push({ 'metadata.fileIdentifier': { $exists: true } });
    }

    const selectFields = { text: 0 };
    const sortOptions = { updatedAt: -1 };

    return await getFiles(filter, sortOptions, selectFields);
  } catch (error) {
    logger.error('[getToolFilesByIds] Error retrieving tool files:', error);
    throw new Error('Error retrieving tool files');
  }
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

/**
 * Batch updates files with new signed URLs in MongoDB
 *
 * @param {MongoFile[]} updates - Array of updates in the format { file_id, filepath }
 * @returns {Promise<void>}
 */
async function batchUpdateFiles(updates) {
  if (!updates || updates.length === 0) {
    return;
  }

  const bulkOperations = updates.map((update) => ({
    updateOne: {
      filter: { file_id: update.file_id },
      update: { $set: { filepath: update.filepath } },
    },
  }));

  const result = await File.bulkWrite(bulkOperations);
  logger.info(`Updated ${result.modifiedCount} files with new S3 URLs`);
}

module.exports = {
  findFileById,
  getFiles,
  getToolFilesByIds,
  createFile,
  updateFile,
  updateFileUsage,
  deleteFile,
  deleteFiles,
  deleteFileByFilter,
  batchUpdateFiles,
  hasAccessToFilesViaAgent,
};
