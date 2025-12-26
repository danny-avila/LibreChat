const { EModelEndpoint } = require('librechat-data-provider');
const e2bClientManager = require('./initialize');
const { getE2BAssistantDocs } = require('~/models/E2BAssistant');

/**
 * Initializes the E2B Assistants client.
 * For E2B, this primarily returns the client manager and necessary context.
 * 
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @returns {Promise<Object>} The initialized client context
 */
const initializeClient = async ({ req, res }) => {
  // Ensure the user has access/permissions if needed
  // Return the manager which handles sandboxes
  return {
    e2bClient: e2bClientManager,
    // Add other context needed for the controller
  };
};

/**
 * Lists available E2B assistants (agents).
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @returns {Promise<Array>} List of assistants
 */
const listAssistants = async ({ userId }) => {
  // Retrieve assistants from local DB
  const assistants = await getE2BAssistantDocs({ userId });
  return assistants.map(a => ({
    id: a.assistant_id,
    object: 'assistant',
    created_at: Math.floor(new Date(a.createdAt).getTime() / 1000),
    name: a.name,
    description: a.description,
    model: a.model,
    instructions: a.instructions,
    tools: a.tools,
    metadata: a.metadata,
  }));
};

module.exports = {
  initializeClient,
  listAssistants,
  e2bClientManager,
};
