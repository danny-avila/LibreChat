const { v4 } = require('uuid');
const { findDeniedAssistantRunTools } = require('@librechat/api');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { handleAbortError } = require('~/server/middleware/abortMiddleware');
const { getRoleByName } = require('~/models');

/**
 * Checks if the assistant is supported or excluded
 * @param {object} req - Express Request
 * @param {object} req.body - The request payload.
 * @param {object} res - Express Response
 * @param {function} next - Express next middleware function.
 * @returns {Promise<void>}
 */
const validateAssistant = async (req, res, next) => {
  const { endpoint, conversationId, assistant_id, messageId } = req.body;

  /** Runs before the assistants-config early return below: a denied native
   *  tool refuses the run regardless of whether this endpoint carries an
   *  assistants config. */
  const deniedTools = await findDeniedAssistantRunTools({
    req,
    getRoleByName,
    getTools: async () => {
      const { openai } = await getOpenAIClient({
        req,
        res,
        endpointOption: req.body.endpointOption,
      });
      const assistant = await openai.beta.assistants.retrieve(assistant_id);
      return assistant?.tools;
    },
  });
  if (deniedTools.length) {
    const error = { message: 'validateAssistant: Assistant tool not permitted for role' };
    return await handleAbortError(res, req, error, {
      sender: 'System',
      conversationId,
      messageId: v4(),
      parentMessageId: messageId,
      error,
    });
  }

  const appConfig = req.config;
  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = appConfig.endpoints?.[endpoint];
  if (!assistantsConfig) {
    return next();
  }

  const { supportedIds, excludedIds } = assistantsConfig;
  const error = { message: 'validateAssistant: Assistant not supported' };

  if (supportedIds?.length && !supportedIds.includes(assistant_id)) {
    return await handleAbortError(res, req, error, {
      sender: 'System',
      conversationId,
      messageId: v4(),
      parentMessageId: messageId,
      error,
    });
  } else if (excludedIds?.length && excludedIds.includes(assistant_id)) {
    return await handleAbortError(res, req, error, {
      sender: 'System',
      conversationId,
      messageId: v4(),
      parentMessageId: messageId,
    });
  }

  return next();
};

module.exports = validateAssistant;
