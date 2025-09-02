const { v4 } = require('uuid');
const { handleAbortError } = require('~/server/middleware/abortMiddleware');

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

  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = req.app.locals?.[endpoint];
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
