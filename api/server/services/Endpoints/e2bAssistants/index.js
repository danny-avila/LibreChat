const { EModelEndpoint } = require('librechat-data-provider');
const { initializeClient: initE2B, e2bClientManager } = require('./initialize');
const { getE2BAssistantDocs } = require('~/models/E2BAssistant');
const { buildOptions } = require('./buildOptions');
const OpenAI = require('openai');

/**
 * Initializes the E2B Assistants client.
 * Returns both the E2B manager and a standard OpenAI client for inference.
 * 
 * @param {Object} params
 * @returns {Promise<Object>} The initialized client context
 */
const initializeClient = async ({ req, res }) => {
  // 1. Get E2B Client Manager
  const { e2bClient } = await initE2B({ req, res });

  // 2. Initialize OpenAI Client for the Agent's brain
  // In a real scenario, we should get the API key from config or user provided keys
  // For now, using process.env as a fallback, matching the helpers.js pattern
  const apiKey = process.env.OPENAI_API_KEY;
  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  return {
    e2bClient,
    openai,
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
