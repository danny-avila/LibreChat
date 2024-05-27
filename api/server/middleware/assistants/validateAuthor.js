/**
 * Checks if the assistant is supported or excluded
 * @param {object} params
 * @param {object} params.req - Express Request
 * @param {object} params.req.body - The request payload.
 * @param {OpenAIClient} params.openai - OpenAI API Client
 * @returns {Promise<void>}
 */
const validateAuthor = async ({ req, openai }) => {
  if (req.user.role === 'ADMIN') {
    return;
  }
  const { endpoint, assistant_id } = req.body;

  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = req.app.locals?.[endpoint];
  if (!assistantsConfig) {
    return;
  }

  if (!assistantsConfig.privateAssistants) {
    return;
  }

  const assistant = await openai.beta.assistants.retrieve(assistant_id);
  const isValid =
    req.user.id === assistant.metadata?.author || assistant.metadata?.author === undefined;

  if (!isValid) {
    throw new Error(`Assistant ${assistant_id} is not authored by the user.`);
  }
};

module.exports = validateAuthor;
