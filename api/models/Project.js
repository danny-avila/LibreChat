const crypto = require('crypto');
const { model } = require('mongoose');
const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;
const projectSchema = require('~/models/schema/projectSchema');
const logger = require('~/config/winston');

const Project = model('Project', projectSchema);

/**
 * Retrieve a project by ID and convert the found project document to a plain object.
 *
 * @param {string} projectId - The ID of the project to find and return as a plain object.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<MongoProject>} A plain object representing the project document, or `null` if no project is found.
 */
const getProjectById = async function (projectId, fieldsToSelect = null) {
  const query = Project.findById(projectId);

  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }

  return await query.lean();
};

/**
 * Retrieve a project by name and convert the found project document to a plain object.
 * If the project with the given name doesn't exist and the name is "instance", create it and return the lean version.
 *
 * @param {string} projectName - The name of the project to find or create.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<MongoProject>} A plain object representing the project document.
 */
const getProjectByName = async function (projectName, fieldsToSelect = null) {
  const query = { name: projectName };
  const update = { $setOnInsert: { name: projectName } };
  const options = {
    new: true,
    upsert: projectName === GLOBAL_PROJECT_NAME,
    lean: true,
    select: fieldsToSelect,
  };

  return await Project.findOneAndUpdate(query, update, options);
};

/**
 * Add an array of prompt group IDs to a project's promptGroupIds array, ensuring uniqueness.
 *
 * @param {string} projectId - The ID of the project to update.
 * @param {string[]} promptGroupIds - The array of prompt group IDs to add to the project.
 * @returns {Promise<MongoProject>} The updated project document.
 */
const addGroupIdsToProject = async function (projectId, promptGroupIds) {
  return await Project.findByIdAndUpdate(
    projectId,
    { $addToSet: { promptGroupIds: { $each: promptGroupIds } } },
    { new: true },
  );
};

/**
 * Remove an array of prompt group IDs from a project's promptGroupIds array.
 *
 * @param {string} projectId - The ID of the project to update.
 * @param {string[]} promptGroupIds - The array of prompt group IDs to remove from the project.
 * @returns {Promise<MongoProject>} The updated project document.
 */
const removeGroupIdsFromProject = async function (projectId, promptGroupIds) {
  return await Project.findByIdAndUpdate(
    projectId,
    { $pull: { promptGroupIds: { $in: promptGroupIds } } },
    { new: true },
  );
};

/**
 * Remove a prompt group ID from all projects.
 *
 * @param {string} promptGroupId - The ID of the prompt group to remove from projects.
 * @returns {Promise<void>}
 */
const removeGroupFromAllProjects = async (promptGroupId) => {
  await Project.updateMany({}, { $pull: { promptGroupIds: promptGroupId } });
};

/**
 * Add an array of agent IDs to a project's agentIds array, ensuring uniqueness.
 *
 * @param {string} projectId - The ID of the project to update.
 * @param {string[]} agentIds - The array of agent IDs to add to the project.
 * @returns {Promise<MongoProject>} The updated project document.
 */
const addAgentIdsToProject = async function (projectId, agentIds) {
  return await Project.findByIdAndUpdate(
    projectId,
    { $addToSet: { agentIds: { $each: agentIds } } },
    { new: true },
  );
};

/**
 * Remove an array of agent IDs from a project's agentIds array.
 *
 * @param {string} projectId - The ID of the project to update.
 * @param {string[]} agentIds - The array of agent IDs to remove from the project.
 * @returns {Promise<MongoProject>} The updated project document.
 */
const removeAgentIdsFromProject = async function (projectId, agentIds) {
  return await Project.findByIdAndUpdate(
    projectId,
    { $pull: { agentIds: { $in: agentIds } } },
    { new: true },
  );
};

/**
 * Remove an agent ID from all projects.
 *
 * @param {string} agentId - The ID of the agent to remove from projects.
 * @returns {Promise<void>}
 */
const removeAgentFromAllProjects = async (agentId) => {
  await Project.updateMany({}, { $pull: { agentIds: agentId } });
};

/* ============================
 * User-scoped project functions
 * ============================ */

/**
 * Create a new user-scoped project.
 *
 * @param {Object} params
 * @param {string} params.user - The owner's user ID.
 * @param {string} params.name - The project name.
 * @param {string} [params.description] - The project description.
 * @returns {Promise<MongoProject>} The created project document.
 */
const createUserProject = async function ({ user, name, description }) {
  try {
    const project = await Project.create({ user, name, description });
    return project.toObject();
  } catch (error) {
    logger.error('[createUserProject] Error creating project', error);
    throw error;
  }
};

/**
 * Get all projects for a user.
 *
 * @param {string} user - The user's ID.
 * @param {Object} [options]
 * @param {boolean} [options.isArchived=false] - Whether to fetch archived projects.
 * @returns {Promise<MongoProject[]>} Array of project documents.
 */
const getUserProjects = async function (user, { isArchived = false } = {}) {
  try {
    return await Project.find({ user, isArchived }).sort({ updatedAt: -1 }).lean();
  } catch (error) {
    logger.error('[getUserProjects] Error getting user projects', error);
    throw error;
  }
};

/**
 * Get a project by ID, scoped to a user.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @returns {Promise<MongoProject|null>} The project document or null.
 */
const getUserProjectById = async function (projectId, user) {
  try {
    return await Project.findOne({ _id: projectId, user }).lean();
  } catch (error) {
    logger.error('[getUserProjectById] Error getting project', error);
    throw error;
  }
};

/**
 * Update a user-scoped project.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @param {Object} updateData - Fields to update.
 * @returns {Promise<MongoProject|null>} The updated project or null.
 */
const updateUserProject = async function (projectId, user, updateData) {
  try {
    return await Project.findOneAndUpdate(
      { _id: projectId, user },
      updateData,
      { new: true, lean: true },
    );
  } catch (error) {
    logger.error('[updateUserProject] Error updating project', error);
    throw error;
  }
};

/**
 * Delete a user-scoped project.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @returns {Promise<MongoProject|null>} The deleted project or null.
 */
const deleteUserProject = async function (projectId, user) {
  try {
    return await Project.findOneAndDelete({ _id: projectId, user }).lean();
  } catch (error) {
    logger.error('[deleteUserProject] Error deleting project', error);
    throw error;
  }
};

/**
 * Add a conversation ID to a project's conversationIds array.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @param {string} conversationId - The conversation ID to add.
 * @returns {Promise<MongoProject|null>} The updated project or null.
 */
const addConversationToProject = async function (projectId, user, conversationId) {
  try {
    return await Project.findOneAndUpdate(
      { _id: projectId, user },
      { $addToSet: { conversationIds: conversationId } },
      { new: true, lean: true },
    );
  } catch (error) {
    logger.error('[addConversationToProject] Error adding conversation', error);
    throw error;
  }
};

/**
 * Remove a conversation ID from a project's conversationIds array.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @param {string} conversationId - The conversation ID to remove.
 * @returns {Promise<MongoProject|null>} The updated project or null.
 */
const removeConversationFromProject = async function (projectId, user, conversationId) {
  try {
    return await Project.findOneAndUpdate(
      { _id: projectId, user },
      { $pull: { conversationIds: conversationId } },
      { new: true, lean: true },
    );
  } catch (error) {
    logger.error('[removeConversationFromProject] Error removing conversation', error);
    throw error;
  }
};

/**
 * Add a memory entry to a project.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @param {Object} params
 * @param {string} params.content - The memory content.
 * @param {string} [params.source='manual'] - How the memory was created.
 * @param {string|null} [params.extractedFrom] - The messageId it was extracted from.
 * @param {string} [params.category='general'] - The memory category.
 * @returns {Promise<MongoProject|null>} The updated project or null.
 */
const addMemoryEntry = async function (projectId, user, { content, source, extractedFrom, category }) {
  try {
    const entryId = crypto.randomUUID();
    return await Project.findOneAndUpdate(
      { _id: projectId, user },
      {
        $push: {
          memoryEntries: {
            entryId,
            content,
            source: source || 'manual',
            extractedFrom: extractedFrom || null,
            category: category || 'general',
          },
        },
      },
      { new: true, lean: true },
    );
  } catch (error) {
    logger.error('[addMemoryEntry] Error adding memory entry', error);
    throw error;
  }
};

/**
 * Remove a memory entry from a project.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @param {string} entryId - The memory entry's ID.
 * @returns {Promise<MongoProject|null>} The updated project or null.
 */
const removeMemoryEntry = async function (projectId, user, entryId) {
  try {
    return await Project.findOneAndUpdate(
      { _id: projectId, user },
      { $pull: { memoryEntries: { entryId } } },
      { new: true, lean: true },
    );
  } catch (error) {
    logger.error('[removeMemoryEntry] Error removing memory entry', error);
    throw error;
  }
};

/**
 * Update a memory entry in a project.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @param {string} entryId - The memory entry's ID.
 * @param {Object} params
 * @param {string} [params.content] - Updated content.
 * @param {string} [params.category] - Updated category.
 * @returns {Promise<MongoProject|null>} The updated project or null.
 */
const updateMemoryEntry = async function (projectId, user, entryId, { content, category }) {
  try {
    const setFields = {};
    if (content !== undefined) {
      setFields['memoryEntries.$.content'] = content;
    }
    if (category !== undefined) {
      setFields['memoryEntries.$.category'] = category;
    }
    return await Project.findOneAndUpdate(
      { _id: projectId, user, 'memoryEntries.entryId': entryId },
      { $set: setFields },
      { new: true, lean: true },
    );
  } catch (error) {
    logger.error('[updateMemoryEntry] Error updating memory entry', error);
    throw error;
  }
};

/**
 * Get memory entries for a project.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @returns {Promise<MemoryEntry[]>} Array of memory entries.
 */
const getProjectMemory = async function (projectId, user) {
  try {
    const project = await Project.findOne(
      { _id: projectId, user },
      { memoryEntries: 1 },
    ).lean();
    return project?.memoryEntries || [];
  } catch (error) {
    logger.error('[getProjectMemory] Error getting project memory', error);
    throw error;
  }
};

/**
 * Add a file ID to a project's fileIds array.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @param {string} fileId - The file ID to add.
 * @returns {Promise<MongoProject|null>} The updated project or null.
 */
const addFileToProject = async function (projectId, user, fileId) {
  try {
    return await Project.findOneAndUpdate(
      { _id: projectId, user },
      { $addToSet: { fileIds: fileId } },
      { new: true, lean: true },
    );
  } catch (error) {
    logger.error('[addFileToProject] Error adding file to project', error);
    throw error;
  }
};

/**
 * Remove a file ID from a project's fileIds array.
 *
 * @param {string} projectId - The project's ID.
 * @param {string} user - The user's ID.
 * @param {string} fileId - The file ID to remove.
 * @returns {Promise<MongoProject|null>} The updated project or null.
 */
const removeFileFromProject = async function (projectId, user, fileId) {
  try {
    return await Project.findOneAndUpdate(
      { _id: projectId, user },
      { $pull: { fileIds: fileId } },
      { new: true, lean: true },
    );
  } catch (error) {
    logger.error('[removeFileFromProject] Error removing file from project', error);
    throw error;
  }
};

module.exports = {
  getProjectById,
  getProjectByName,
  /* prompts */
  addGroupIdsToProject,
  removeGroupIdsFromProject,
  removeGroupFromAllProjects,
  /* agents */
  addAgentIdsToProject,
  removeAgentIdsFromProject,
  removeAgentFromAllProjects,
  /* user-scoped projects */
  createUserProject,
  getUserProjects,
  getUserProjectById,
  updateUserProject,
  deleteUserProject,
  /* project conversations */
  addConversationToProject,
  removeConversationFromProject,
  /* project memory */
  addMemoryEntry,
  removeMemoryEntry,
  updateMemoryEntry,
  getProjectMemory,
  /* project files */
  addFileToProject,
  removeFileFromProject,
};
