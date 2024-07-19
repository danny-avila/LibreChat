const { v4 } = require('uuid');
const { handleAbortError } = require('~/server/middleware/abortMiddleware');
const { logger } = require('~/config');

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
  const message = 'Assistant not supported';
  const error = { message };

  logger.warn(`validateAssistant:

${JSON.stringify(
    {
      message,
      userId: req.user.id,
      conversationId,
      assistant_id,
      supportedIds,
      excludedIds,
    },
    null,
    2,
  )}
`);

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
