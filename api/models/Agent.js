const mongoose = require('mongoose');
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
 * Update an agent with new data without overwriting existing properties,
 * or create a new agent if it doesn't exist, within a transaction session if provided.
 *
 * @param {Object} searchParameter - The search parameters to find the agent to update.
 * @param {string} searchParameter.id - The ID of the agent to update.
 * @param {string} searchParameter.author - The user ID of the agent's author.
 * @param {Object} updateData - An object containing the properties to update.
 * @param {mongoose.ClientSession} [session] - The transaction session to use (optional).
 * @returns {Promise<Agent>} The updated or newly created agent document as a plain object.
 */
const updateAgent = async (searchParameter, updateData, session = null) => {
  const options = { new: true, upsert: true, session };
  return await Agent.findOneAndUpdate(searchParameter, updateData, options).lean();
};

/**
 * Deletes an agent based on the provided ID.
 *
 * @param {Object} searchParameter - The search parameters to find the agent to delete.
 * @param {string} searchParameter.id - The ID of the agent to delete.
 * @param {string} searchParameter.author - The user ID of the agent's author.
 * @returns {Promise<void>} Resolves when the agent has been successfully deleted.
 */
const deleteAgent = async (searchParameter) => {
  return await Agent.findOneAndDelete(searchParameter);
};

/**
 * Get all agents.
 * @param {Object} searchParameter - The search parameters to find matching agents.
 * @param {string} searchParameter.author - The user ID of the agent's author.
 * @returns {Promise<Object>} A promise that resolves to an object containing the agents data and pagination info.
 */
const getListAgents = async (searchParameter) => {
  const agents = await Agent.find(searchParameter, {
    id: 1,
    name: 1,
    avatar: 1,
  }).lean();
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

module.exports = {
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  getListAgents,
};
