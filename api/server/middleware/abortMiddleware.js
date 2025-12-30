const { logger } = require('@librechat/data-schemas');
const {
  countTokens,
  isEnabled,
  sendEvent,
  GenerationJobManager,
  sanitizeMessageForTransmit,
} = require('@librechat/api');
const { isAssistantsEndpoint, ErrorTypes } = require('librechat-data-provider');
const { truncateText, smartTruncateText } = require('~/app/clients/prompts');
const clearPendingReq = require('~/cache/clearPendingReq');
const { sendError } = require('~/server/middleware/error');
const { spendTokens } = require('~/models/spendTokens');
const { saveMessage, getConvo } = require('~/models');
const { abortRun } = require('./abortRun');

/**
 * Abort an active message generation.
 * Uses GenerationJobManager for all agent requests.
 * Since streamId === conversationId, we can directly abort by conversationId.
 */
async function abortMessage(req, res) {
  const { abortKey, endpoint } = req.body;

  if (isAssistantsEndpoint(endpoint)) {
    return await abortRun(req, res);
  }

  const conversationId = abortKey?.split(':')?.[0] ?? req.user.id;
  const userId = req.user.id;

  // Use GenerationJobManager to abort the job (streamId === conversationId)
  const abortResult = await GenerationJobManager.abortJob(conversationId);

  if (!abortResult.success) {
    if (!res.headersSent) {
      return res.status(204).send({ message: 'Request not found' });
    }
    return;
  }

  const { jobData, content, text } = abortResult;

  // Count tokens and spend them
  const completionTokens = await countTokens(text);
  const promptTokens = jobData?.promptTokens ?? 0;

  const responseMessage = {
    messageId: jobData?.responseMessageId,
    parentMessageId: jobData?.userMessage?.messageId,
    conversationId: jobData?.conversationId,
    content,
    text,
    sender: jobData?.sender ?? 'AI',
    finish_reason: 'incomplete',
    endpoint: jobData?.endpoint,
    iconURL: jobData?.iconURL,
    model: jobData?.model,
    unfinished: false,
    error: false,
    isCreatedByUser: false,
    tokenCount: completionTokens,
  };

  await spendTokens(
    { ...responseMessage, context: 'incomplete', user: userId },
    { promptTokens, completionTokens },
  );

  await saveMessage(
    req,
    { ...responseMessage, user: userId },
    { context: 'api/server/middleware/abortMiddleware.js' },
  );

  // Get conversation for title
  const conversation = await getConvo(userId, conversationId);

  const finalEvent = {
    title: conversation && !conversation.title ? null : conversation?.title || 'New Chat',
    final: true,
    conversation,
    requestMessage: jobData?.userMessage
      ? sanitizeMessageForTransmit({
          messageId: jobData.userMessage.messageId,
          parentMessageId: jobData.userMessage.parentMessageId,
          conversationId: jobData.userMessage.conversationId,
          text: jobData.userMessage.text,
          isCreatedByUser: true,
        })
      : null,
    responseMessage,
  };

  logger.debug(
    `[abortMessage] ID: ${userId} | ${req.user.email} | Aborted request: ${conversationId}`,
  );

  if (res.headersSent) {
    return sendEvent(res, finalEvent);
  }

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(finalEvent));
}

const handleAbort = function () {
  return async function (req, res) {
    try {
      if (isEnabled(process.env.LIMIT_CONCURRENT_MESSAGES)) {
        await clearPendingReq({ userId: req.user.id });
      }
      return await abortMessage(req, res);
    } catch (err) {
      logger.error('[abortMessage] handleAbort error', err);
    }
  };
};

/**
 * Handle abort errors during generation.
 * @param {ServerResponse} res
 * @param {ServerRequest} req
 * @param {Error | unknown} error
 * @param {Partial<TMessage> & { partialText?: string }} data
 * @returns {Promise<void>}
 */
const handleAbortError = async (res, req, error, data) => {
  if (error?.message?.includes('base64')) {
    logger.error('[handleAbortError] Error in base64 encoding', {
      ...error,
      stack: smartTruncateText(error?.stack, 1000),
      message: truncateText(error.message, 350),
    });
  } else {
    logger.error('[handleAbortError] AI response error; aborting request:', error);
  }
  const { sender, conversationId, messageId, parentMessageId, userMessageId, partialText } = data;

  if (error.stack && error.stack.includes('google')) {
    logger.warn(
      `AI Response error for conversation ${conversationId} likely caused by Google censor/filter`,
    );
  }

  let errorText = error?.message?.includes('"type"')
    ? error.message
    : 'An error occurred while processing your request. Please contact the Admin.';

  if (error?.type === ErrorTypes.INVALID_REQUEST) {
    errorText = `{"type":"${ErrorTypes.INVALID_REQUEST}"}`;
  }

  if (error?.message?.includes("does not support 'system'")) {
    errorText = `{"type":"${ErrorTypes.NO_SYSTEM_MESSAGES}"}`;
  }

  /**
   * @param {string} partialText
   * @returns {Promise<void>}
   */
  const respondWithError = async (partialText) => {
    const endpointOption = req.body?.endpointOption;
    let options = {
      sender,
      messageId,
      conversationId,
      parentMessageId,
      text: errorText,
      user: req.user.id,
      spec: endpointOption?.spec,
      iconURL: endpointOption?.iconURL,
      modelLabel: endpointOption?.modelLabel,
      shouldSaveMessage: userMessageId != null,
      model: endpointOption?.modelOptions?.model || req.body?.model,
    };

    if (req.body?.agent_id) {
      options.agent_id = req.body.agent_id;
    }

    if (partialText) {
      options = {
        ...options,
        error: false,
        unfinished: true,
        text: partialText,
      };
    }

    await sendError(req, res, options);
  };

  if (partialText && partialText.length > 5) {
    try {
      return await abortMessage(req, res);
    } catch (err) {
      logger.error('[handleAbortError] error while trying to abort message', err);
      return respondWithError(partialText);
    }
  } else {
    return respondWithError();
  }
};

module.exports = {
  handleAbort,
  handleAbortError,
};
