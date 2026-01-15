const { EModelEndpoint } = require('librechat-data-provider');
const { initializeClient: initE2B, e2bClientManager } = require('./initialize');
const { getE2BAssistantDocs } = require('~/models/E2BAssistant');
const { buildOptions } = require('./buildOptions');

/**
 * Initializes the E2B Assistants client.
 * Returns both the E2B manager and a standard OpenAI client for inference.
 * 
 * @param {Object} params
 * @returns {Promise<Object>} The initialized client context
 */
const initializeClient = async ({ req, res }) => {
  // Get E2B Client Manager and OpenAI client (supports Azure OpenAI)
  // The initE2B function now handles both Azure OpenAI and standard OpenAI
  const { e2bClient, openai, openAIApiKey } = await initE2B({ req, res });

  return {
    e2bClient,
    openai,
    openAIApiKey,
  };
};

/**
 * Lists available E2B assistants (agents).
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
  buildOptions,
  initializeClient,
  listAssistants,
  e2bClientManager,
};
