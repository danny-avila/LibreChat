const { isAssistantsEndpoint } = require('librechat-data-provider');
const { sendMessage, sendError, countTokens, isEnabled } = require('~/server/utils');
const { truncateText, smartTruncateText } = require('~/app/clients/prompts');
const { saveMessage, getConvo, getConvoTitle } = require('~/models');
const clearPendingReq = require('~/cache/clearPendingReq');
const abortControllers = require('./abortControllers');
const spendTokens = require('~/models/spendTokens');
const { abortRun } = require('./abortRun');
const { logger } = require('~/config');

async function abortMessage(req, res) {
  let { abortKey, conversationId, endpoint } = req.body;

  if (!abortKey && conversationId) {
    abortKey = conversationId;
  }

  if (isAssistantsEndpoint(endpoint)) {
    return await abortRun(req, res);
  }

  if (!abortControllers.has(abortKey) && !res.headersSent) {
    return res.status(204).send({ message: 'Request not found' });
  }

  const { abortController } = abortControllers.get(abortKey);
  const finalEvent = await abortController.abortCompletion();
  logger.debug('[abortMessage] Aborted request', { abortKey });
  abortControllers.delete(abortKey);

  if (res.headersSent && finalEvent) {
    return sendMessage(res, finalEvent);
  }

  res.setHeader('Content-Type', 'application/json');

  res.send(JSON.stringify(finalEvent));
}

const handleAbort = () => {
  return async (req, res) => {
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

const createAbortController = (req, res, getAbortData) => {
  const abortController = new AbortController();
  const { endpointOption } = req.body;
  const onStart = (userMessage) => {
    sendMessage(res, { message: userMessage, created: true });
    const abortKey = userMessage?.conversationId ?? req.user.id;
    abortControllers.set(abortKey, { abortController, ...endpointOption });

    res.on('finish', function () {
      abortControllers.delete(abortKey);
    });
  };

  abortController.abortCompletion = async function () {
    abortController.abort();
    const { conversationId, userMessage, promptTokens, ...responseData } = getAbortData();
    const completionTokens = await countTokens(responseData?.text ?? '');
    const user = req.user.id;

    const responseMessage = {
      ...responseData,
      conversationId,
      finish_reason: 'incomplete',
      endpoint: endpointOption.endpoint,
      iconURL: endpointOption.iconURL,
      model: endpointOption.modelOptions.model,
      unfinished: false,
      error: false,
      isCreatedByUser: false,
      tokenCount: completionTokens,
    };

    await spendTokens(
      { ...responseMessage, context: 'incomplete', user },
      { promptTokens, completionTokens },
    );

    saveMessage({ ...responseMessage, user });

    return {
      title: await getConvoTitle(user, conversationId),
      final: true,
      conversation: await getConvo(user, conversationId),
      requestMessage: userMessage,
      responseMessage: responseMessage,
    };
  };

  return { abortController, onStart };
};

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
  const { sender, conversationId, messageId, parentMessageId, partialText } = data;

  if (error.stack && error.stack.includes('google')) {
    logger.warn(
      `AI Response error for conversation ${conversationId} likely caused by Google censor/filter`,
    );
  }

  const errorText = error?.message?.includes('"type"')
    ? error.message
    : 'An error occurred while processing your request. Please contact the Admin.';

  const respondWithError = async (partialText) => {
    let options = {
      sender,
      messageId,
      conversationId,
      parentMessageId,
      text: errorText,
      shouldSaveMessage: true,
      user: req.user.id,
    };

    if (partialText) {
      options = {
        ...options,
        error: false,
        unfinished: true,
        text: partialText,
      };
    }

    const callback = async () => {
      if (abortControllers.has(conversationId)) {
        const { abortController } = abortControllers.get(conversationId);
        abortController.abort();
        abortControllers.delete(conversationId);
      }
    };

    await sendError(res, options, callback);
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
  createAbortController,
  handleAbortError,
};
