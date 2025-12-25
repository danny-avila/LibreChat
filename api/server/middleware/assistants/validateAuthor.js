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

  const appConfig = req.config;
  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = appConfig.endpoints?.[endpoint];
  if (!assistantsConfig) {
    return;
  }

  // 只有在明确设置 privateAssistants: false 时才跳过作者验证
  // 默认情况（undefined）和 true 都需要验证作者
  if (assistantsConfig.privateAssistants === false) {
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
