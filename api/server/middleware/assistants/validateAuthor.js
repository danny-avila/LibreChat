const { SystemRoles } = require('librechat-data-provider');
const { getAssistant } = require('~/models/Assistant');

/**
 * Validates that the user is the author of the assistant.
 * Non-admin users can only modify their own assistants.
 * @param {object} params
 * @param {object} params.req - Express Request
 * @param {object} params.req.body - The request payload.
 * @param {string} params.overrideEndpoint - The override endpoint
 * @param {string} params.overrideAssistantId - The override assistant ID
 * @param {OpenAIClient} params.openai - OpenAI API Client
 * @returns {Promise<void>}
 */
const validateAuthor = async ({ req, openai, overrideEndpoint, overrideAssistantId }) => {
  // Admin users can modify any assistant
  if (req.user.role === SystemRoles.ADMIN) {
    return;
  }

  const endpoint = overrideEndpoint ?? req.body.endpoint ?? req.query.endpoint;
  const assistant_id =
    overrideAssistantId ?? req.params.id ?? req.body.assistant_id ?? req.query.assistant_id;

  if (!assistant_id) {
    throw new Error('Assistant ID is required for validation.');
  }

  const appConfig = req.config;
  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = appConfig.endpoints?.[endpoint];

  // Only skip author validation if privateAssistants is explicitly set to false
  // Default behavior (no config or undefined) requires author validation for security
  if (assistantsConfig?.privateAssistants === false) {
    return;
  }

  // Check if user owns this assistant in the database
  const assistantDoc = await getAssistant({ assistant_id, user: req.user.id });
  if (assistantDoc) {
    return;
  }

  // Fallback: check the assistant's metadata from OpenAI/Azure API
  const assistant = await openai.beta.assistants.retrieve(assistant_id);
  if (req.user.id !== assistant?.metadata?.author) {
    throw new Error(`Assistant ${assistant_id} is not authored by the user.`);
  }
};

module.exports = validateAuthor;
