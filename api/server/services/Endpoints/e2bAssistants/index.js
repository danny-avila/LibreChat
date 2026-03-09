const { EModelEndpoint } = require('librechat-data-provider');
const { initializeClient: initE2B, e2bClientManager } = require('./initialize');
const { getE2BAssistantDocs } = require('~/models/E2BAssistant');
const { buildOptions } = require('./buildOptions');

const toIdString = (value) => (value == null ? '' : value.toString?.() ?? String(value));

const normalizeMetadata = (assistant) => {
  const metadata =
    assistant?.metadata && typeof assistant.metadata === 'object' ? { ...assistant.metadata } : {};

  // Author can be stored as ObjectId in legacy records; normalize to string for visibility checks.
  if (metadata.author !== undefined && metadata.author !== null) {
    metadata.author = toIdString(metadata.author);
  }

  if (!metadata.author && assistant?.author) {
    metadata.author = toIdString(assistant.author);
  }

  if (!metadata.role && assistant?.role) {
    metadata.role = assistant.role;
  }

  if (metadata.group === undefined && assistant?.group !== undefined && assistant?.group !== null) {
    metadata.group = assistant.group;
  }

  if (!metadata.endpoint) {
    metadata.endpoint = EModelEndpoint.e2bAssistants;
  }

  return metadata;
};

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
const listAssistants = async () => {
  // Retrieve all assistants; visibility is filtered by shared assistant filtering logic.
  const assistants = await getE2BAssistantDocs({});
  return assistants.map(a => ({
    id: a.id,
    object: 'assistant',
    created_at: Math.floor(new Date(a.createdAt ?? Date.now()).getTime() / 1000),
    name: a.name,
    description: a.description,
    model: a.model,
    instructions: a.prompt,
    tools: a.tools,
    metadata: normalizeMetadata(a),
  }));
};

module.exports = {
  buildOptions,
  initializeClient,
  listAssistants,
  e2bClientManager,
};
