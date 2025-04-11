const { isAssistantsEndpoint, ErrorTypes } = require('librechat-data-provider');
const { sendMessage, sendError, countTokens, isEnabled } = require('~/server/utils');
const { truncateText, smartTruncateText } = require('~/app/clients/prompts');
const clearPendingReq = require('~/cache/clearPendingReq');
const { spendTokens } = require('~/models/spendTokens');
const abortControllers = require('./abortControllers');
const { saveMessage, getConvo } = require('~/models');
const { abortRun } = require('./abortRun');
const { logger } = require('~/config');

function cleanupAbortController(abortKey) {
  if (!abortControllers.has(abortKey)) {
    return false;
  }

  const { abortController } = abortControllers.get(abortKey);

  if (!abortController) {
    abortControllers.delete(abortKey);
    return true;
  }

  // 1. Check if this controller has any composed signals and clean them up
  // We'll look for any signals created from this controller's signal
  try {
    // This creates a temporary composed signal to use for cleanup
    const composedSignal = AbortSignal.any([abortController.signal]);

    // Get all event types - in practice, AbortSignal typically only uses 'abort'
    const eventTypes = ['abort'];

    // First, execute a dummy listener removal to handle potential composed signals
    // created in dependencies that we don't have direct references to
    for (const eventType of eventTypes) {
      // Create and immediately remove a dummy listener
      // This helps break potential reference loops and force cleanup
      const dummyHandler = () => {};
      composedSignal.addEventListener(eventType, dummyHandler);
      composedSignal.removeEventListener(eventType, dummyHandler);

      // For extra thoroughness, we could try to use the DOM-like event listener removal
      // for all possible existing listeners (might not work in all environments)
      const listeners = composedSignal.listeners?.(eventType) || [];
      for (const listener of listeners) {
        composedSignal.removeEventListener(eventType, listener);
      }
    }
  } catch (e) {
    // If something goes wrong with the signal cleanup, log but continue
    logger.debug(`Error cleaning up composed signals: ${e}`);
  }

  // 2. Abort the controller if not already aborted
  if (!abortController.signal.aborted) {
    abortController.abort();
  }

  // 3. Remove from registry
  abortControllers.delete(abortKey);

  // 4. Additional cleanup to help prevent leaks
  if (abortController.getAbortData) {
    abortController.getAbortData = null;
  }
  if (abortController.abortCompletion) {
    abortController.abortCompletion = null;
  }

  return true;
}

async function abortMessage(req, res) {
  let { abortKey, endpoint } = req.body;

  if (isAssistantsEndpoint(endpoint)) {
    return await abortRun(req, res);
  }

  const conversationId = abortKey?.split(':')?.[0] ?? req.user.id;

  if (!abortControllers.has(abortKey) && abortControllers.has(conversationId)) {
    abortKey = conversationId;
  }

  if (!abortControllers.has(abortKey) && !res.headersSent) {
    return res.status(204).send({ message: 'Request not found' });
  }

  const { abortController } = abortControllers.get(abortKey) ?? {};
  if (!abortController) {
    return res.status(204).send({ message: 'Request not found' });
  }
  const finalEvent = await abortController.abortCompletion();
  logger.debug(
    `[abortMessage] ID: ${req.user.id} | ${req.user.email} | Aborted request: ` +
      JSON.stringify({ abortKey }),
  );
  cleanupAbortController(abortKey);

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

const createAbortController = (req, res, getAbortData, getReqData) => {
  let abortKey;
  const abortController = new AbortController();
  const { endpointOption } = req.body;

  abortController.getAbortData = getAbortData;

  /**
   * @param {TMessage} userMessage
   * @param {string} responseMessageId
   */
  const onStart = (userMessage, responseMessageId) => {
    sendMessage(res, { message: userMessage, created: true });

    abortKey = userMessage?.conversationId ?? req.user.id;
    const prevRequest = abortControllers.get(abortKey);
    const { overrideUserMessageId } = req?.body ?? {};

    if (overrideUserMessageId != null && prevRequest && prevRequest?.abortController) {
      const data = prevRequest.abortController.getAbortData();
      getReqData({ userMessage: data?.userMessage });
      const addedAbortKey = `${abortKey}:${responseMessageId}`;
      abortControllers.set(addedAbortKey, { abortController, ...endpointOption });
      res.on('finish', function () {
        cleanupAbortController(addedAbortKey);
      });
      return;
    }

    abortControllers.set(abortKey, { abortController, ...endpointOption });

    res.on('finish', function () {
      cleanupAbortController(abortKey);
    });
  };

  abortController.abortCompletion = async function () {
    abortController.abort();
    const { conversationId, userMessage, userMessagePromise, promptTokens, ...responseData } =
      getAbortData();
    const completionTokens = await countTokens(responseData?.text ?? '');
    const user = req.user.id;

    const responseMessage = {
      ...responseData,
      conversationId,
      finish_reason: 'incomplete',
      endpoint: endpointOption.endpoint,
      iconURL: endpointOption.iconURL,
      model: endpointOption.modelOptions?.model ?? endpointOption.model_parameters?.model,
      unfinished: false,
      error: false,
      isCreatedByUser: false,
      tokenCount: completionTokens,
    };

    await spendTokens(
      { ...responseMessage, context: 'incomplete', user },
      { promptTokens, completionTokens },
    );

    await saveMessage(
      req,
      { ...responseMessage, user },
      { context: 'api/server/middleware/abortMiddleware.js' },
    );

    let conversation;
    if (userMessagePromise) {
      const resolved = await userMessagePromise;
      conversation = resolved?.conversation;
    }

    if (!conversation) {
      conversation = await getConvo(req.user.id, conversationId);
    }

    return {
      title: conversation && !conversation.title ? null : conversation?.title || 'New Chat',
      final: true,
      conversation,
      requestMessage: userMessage,
      responseMessage: responseMessage,
    };
  };

  return { abortController, onStart, abortKey };
};

/**
 * @param {ServerResponse} res
 * @param {ServerRequest} req
 * @param {Error | unknown} error
 * @param {Partial<TMessage> & { partialText?: string }} data
 * @returns { Promise<void> }
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
  const { sender, conversationId, messageId, parentMessageId, partialText } = data;

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

  if (error?.message?.includes('does not support \'system\'')) {
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
      shouldSaveMessage: true,
      spec: endpointOption?.spec,
      iconURL: endpointOption?.iconURL,
      modelLabel: endpointOption?.modelLabel,
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

    const callback = async () => cleanupAbortController(conversationId);

    await sendError(req, res, options, callback);
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
  createAbortController,
  cleanupAbortController,
};
