const mongoose = require('mongoose');
const { SystemRoles } = require('librechat-data-provider');
const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;
const { CONFIG_STORE, STARTUP_CONFIG } = require('librechat-data-provider').CacheKeys;
const {
  getProjectByName,
  addAgentIdsToProject,
  removeAgentIdsFromProject,
  removeAgentFromAllProjects,
} = require('./Project');
const getLogStores = require('~/cache/getLogStores');
const agentSchema = require('./schema/agent');

const Agent = mongoose.model('agent', agentSchema);

/**
 * Create an agent with the provided data.
 * @param {Object} agentData - The agent data to create.
 * @returns {Promise<Agent>} The created agent document as a plain object.
 * @throws {Error} If the agent creation fails.
 */
const createAgent = async (agentData) => {
  return await Agent.create(agentData);
};

/**
 * Get an agent document based on the provided ID.
 *
 * @param {Object} searchParameter - The search parameters to find the agent to update.
 * @param {string} searchParameter.id - The ID of the agent to update.
 * @param {string} searchParameter.author - The user ID of the agent's author.
 * @returns {Promise<Agent|null>} The agent document as a plain object, or null if not found.
 */
const getAgent = async (searchParameter) => await Agent.findOne(searchParameter).lean();

/**
 * Load an agent based on the provided ID
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {string} params.agent_id
 * @returns {Promise<Agent|null>} The agent document as a plain object, or null if not found.
 */
const loadAgent = async ({ req, agent_id }) => {
  const agent = await getAgent({
    id: agent_id,
  });

  if (agent.author.toString() === req.user.id) {
    return agent;
  }

  if (!agent.projectIds) {
    return null;
  }

  const cache = getLogStores(CONFIG_STORE);
  /** @type {TStartupConfig} */
  const cachedStartupConfig = await cache.get(STARTUP_CONFIG);
  let { instanceProjectId } = cachedStartupConfig ?? {};
  if (!instanceProjectId) {
    instanceProjectId = (await getProjectByName(GLOBAL_PROJECT_NAME, '_id'))._id.toString();
  }

  for (const projectObjectId of agent.projectIds) {
    const projectId = projectObjectId.toString();
    if (projectId === instanceProjectId) {
      return agent;
    }
  }
};

/**
 * Update an agent with new data without overwriting existing
 *  properties, or create a new agent if it doesn't exist.
 *
 * @param {Object} searchParameter - The search parameters to find the agent to update.
 * @param {string} searchParameter.id - The ID of the agent to update.
 * @param {string} [searchParameter.author] - The user ID of the agent's author.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<Agent>} The updated or newly created agent document as a plain object.
 */
const updateAgent = async (searchParameter, updateData) => {
  const options = { new: true, upsert: false };
  return await Agent.findOneAndUpdate(searchParameter, updateData, options).lean();
};

/**
 * Deletes an agent based on the provided ID.
 *
 * @param {Object} searchParameter - The search parameters to find the agent to delete.
 * @param {string} searchParameter.id - The ID of the agent to delete.
 * @param {string} [searchParameter.author] - The user ID of the agent's author.
 * @returns {Promise<void>} Resolves when the agent has been successfully deleted.
 */
const deleteAgent = async (searchParameter) => {
  const agent = await Agent.findOneAndDelete(searchParameter);
  if (agent) {
    await removeAgentFromAllProjects(agent.id);
  }
  return agent;
};

/**
 * Get all agents.
 * @param {Object} searchParameter - The search parameters to find matching agents.
 * @param {string} searchParameter.author - The user ID of the agent's author.
 * @returns {Promise<Object>} A promise that resolves to an object containing the agents data and pagination info.
 */
const getListAgents = async (searchParameter) => {
  const { author, ...otherParams } = searchParameter;

  let query = Object.assign({ author }, otherParams);

  const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, ['agentIds']);
  if (globalProject && (globalProject.agentIds?.length ?? 0) > 0) {
    const globalQuery = { id: { $in: globalProject.agentIds }, ...otherParams };
    delete globalQuery.author;
    query = { $or: [globalQuery, query] };
  }

  const agents = (
    await Agent.find(query, {
      id: 1,
      _id: 0,
      name: 1,
      avatar: 1,
      author: 1,
      projectIds: 1,
      isCollaborative: 1,
    }).lean()
  ).map((agent) => {
    if (agent.author?.toString() !== author) {
      delete agent.author;
    }
    if (agent.author) {
      agent.author = agent.author.toString();
    }
    return agent;
  });

  const hasMore = agents.length > 0;
  const firstId = agents.length > 0 ? agents[0].id : null;
  const lastId = agents.length > 0 ? agents[agents.length - 1].id : null;

  return {
    data: agents,
    has_more: hasMore,
    first_id: firstId,
    last_id: lastId,
  };
};

/**
 * Updates the projects associated with an agent, adding and removing project IDs as specified.
 * This function also updates the corresponding projects to include or exclude the agent ID.
 *
 * @param {Object} params - Parameters for updating the agent's projects.
 * @param {import('librechat-data-provider').TUser} params.user - Parameters for updating the agent's projects.
 * @param {string} params.agentId - The ID of the agent to update.
 * @param {string[]} [params.projectIds] - Array of project IDs to add to the agent.
 * @param {string[]} [params.removeProjectIds] - Array of project IDs to remove from the agent.
 * @returns {Promise<MongoAgent>} The updated agent document.
 * @throws {Error} If there's an error updating the agent or projects.
 */
const updateAgentProjects = async ({ user, agentId, projectIds, removeProjectIds }) => {
  const updateOps = {};

  if (removeProjectIds && removeProjectIds.length > 0) {
    for (const projectId of removeProjectIds) {
      await removeAgentIdsFromProject(projectId, [agentId]);
    }
    updateOps.$pull = { projectIds: { $in: removeProjectIds } };
  }

  if (projectIds && projectIds.length > 0) {
    for (const projectId of projectIds) {
      await addAgentIdsToProject(projectId, [agentId]);
    }
    updateOps.$addToSet = { projectIds: { $each: projectIds } };
  }

  if (Object.keys(updateOps).length === 0) {
    return await getAgent({ id: agentId });
  }

  const updateQuery = { id: agentId, author: user.id };
  if (user.role === SystemRoles.ADMIN) {
    delete updateQuery.author;
  }

  const updatedAgent = await updateAgent(updateQuery, updateOps);
  if (updatedAgent) {
    return updatedAgent;
  }
  if (updateOps.$addToSet) {
    for (const projectId of projectIds) {
      await removeAgentIdsFromProject(projectId, [agentId]);
    }
  } else if (updateOps.$pull) {
    for (const projectId of removeProjectIds) {
      await addAgentIdsToProject(projectId, [agentId]);
    }
  }

  return await getAgent({ id: agentId });
};

module.exports = {
  getAgent,
  loadAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getListAgents,
  updateAgentProjects,
};
