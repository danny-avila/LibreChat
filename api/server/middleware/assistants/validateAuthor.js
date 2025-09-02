const { SystemRoles } = require('librechat-data-provider');
const { getAssistant } = require('~/models/Assistant');

/**
 * Checks if the assistant is supported or excluded
 * @param {object} params
 * @param {object} params.req - Express Request
 * @param {object} params.req.body - The request payload.
 * @param {string} params.overrideEndpoint - The override endpoint
 * @param {string} params.overrideAssistantId - The override assistant ID
 * @param {OpenAIClient} params.openai - OpenAI API Client
 * @returns {Promise<void>}
 */
const validateAuthor = async ({ req, openai, overrideEndpoint, overrideAssistantId }) => {
  if (req.user.role === SystemRoles.ADMIN) {
    return;
  }

  const endpoint = overrideEndpoint ?? req.body.endpoint ?? req.query.endpoint;
  const assistant_id =
    overrideAssistantId ?? req.params.id ?? req.body.assistant_id ?? req.query.assistant_id;

  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = req.app.locals?.[endpoint];
  if (!assistantsConfig) {
    return;
  }

  if (!assistantsConfig.privateAssistants) {
    return;
  }

  const assistantDoc = await getAssistant({ assistant_id, user: req.user.id });
  if (assistantDoc) {
    return;
  }
  const assistant = await openai.beta.assistants.retrieve(assistant_id);
  if (req.user.id !== assistant?.metadata?.author) {
    throw new Error(`Assistant ${assistant_id} is not authored by the user.`);
  }
};

module.exports = validateAuthor;
