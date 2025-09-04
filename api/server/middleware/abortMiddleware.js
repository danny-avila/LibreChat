const { logger } = require('@librechat/data-schemas');
const { countTokens, isEnabled, sendEvent } = require('@librechat/api');
const { isAssistantsEndpoint, ErrorTypes, Constants } = require('librechat-data-provider');
const { truncateText, smartTruncateText } = require('~/app/clients/prompts');
const clearPendingReq = require('~/cache/clearPendingReq');
const { sendError } = require('~/server/middleware/error');
const { spendTokens } = require('~/models/spendTokens');
const abortControllers = require('./abortControllers');
const { saveMessage, getConvo } = require('~/models');
const { abortRun } = require('./abortRun');

const abortDataMap = new WeakMap();

/**
 * @param {string} abortKey
 * @returns {boolean}
 */
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
  try {
    // This creates a temporary composed signal to use for cleanup
    const composedSignal = AbortSignal.any([abortController.signal]);

    // Get all event types - in practice, AbortSignal typically only uses 'abort'
    const eventTypes = ['abort'];

    // First, execute a dummy listener removal to handle potential composed signals
    for (const eventType of eventTypes) {
      const dummyHandler = () => {};
      composedSignal.addEventListener(eventType, dummyHandler);
      composedSignal.removeEventListener(eventType, dummyHandler);

      const listeners = composedSignal.listeners?.(eventType) || [];
      for (const listener of listeners) {
        composedSignal.removeEventListener(eventType, listener);
      }
    }
  } catch (e) {
    logger.debug(`Error cleaning up composed signals: ${e}`);
  }

  // 2. Abort the controller if not already aborted
  if (!abortController.signal.aborted) {
    abortController.abort();
  }

  // 3. Remove from registry
  abortControllers.delete(abortKey);

  // 4. Clean up any data stored in the WeakMap
  if (abortDataMap.has(abortController)) {
    abortDataMap.delete(abortController);
  }

  // 5. Clean up function references on the controller
  if (abortController.getAbortData) {
    abortController.getAbortData = null;
  }

  if (abortController.abortCompletion) {
    abortController.abortCompletion = null;
  }

  return true;
}

/**
 * @param {string} abortKey
 * @returns {function(): void}
 */
function createCleanUpHandler(abortKey) {
  return function () {
    try {
      cleanupAbortController(abortKey);
    } catch {
      // Ignore cleanup errors
    }
  };
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

  const finalEvent = await abortController.abortCompletion?.();
  logger.debug(
    `[abortMessage] ID: ${req.user.id} | ${req.user.email} | Aborted request: ` +
      JSON.stringify({ abortKey }),
  );
  cleanupAbortController(abortKey);

  if (res.headersSent && finalEvent) {
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

const createAbortController = (req, res, getAbortData, getReqData) => {
  const abortController = new AbortController();
  const { endpointOption } = req.body;

  // Store minimal data in WeakMap to avoid circular references
  abortDataMap.set(abortController, {
    getAbortDataFn: getAbortData,
    userId: req.user.id,
    endpoint: endpointOption.endpoint,
    iconURL: endpointOption.iconURL,
    model: endpointOption.modelOptions?.model || endpointOption.model_parameters?.model,
  });

  // Replace the direct function reference with a wrapper that uses WeakMap
  abortController.getAbortData = function () {
    const data = abortDataMap.get(this);
    if (!data || typeof data.getAbortDataFn !== 'function') {
      return {};
    }

    try {
      const result = data.getAbortDataFn();

      // Create a copy without circular references
      const cleanResult = { ...result };

      // If userMessagePromise exists, break its reference to client
      if (
        cleanResult.userMessagePromise &&
        typeof cleanResult.userMessagePromise.then === 'function'
      ) {
        // Create a new promise that fulfills with the same result but doesn't reference the original
        const originalPromise = cleanResult.userMessagePromise;
        cleanResult.userMessagePromise = new Promise((resolve, reject) => {
          originalPromise.then(
            (result) => resolve({ ...result }),
            (error) => reject(error),
          );
        });
      }

      return cleanResult;
    } catch (err) {
      logger.error('[abortController.getAbortData] Error:', err);
      return {};
    }
  };

  /**
   * @param {TMessage} userMessage
   * @param {string} responseMessageId
   * @param {boolean} [isNewConvo]
   */
  const onStart = (userMessage, responseMessageId, isNewConvo) => {
    sendEvent(res, { message: userMessage, created: true });

    const prelimAbortKey = userMessage?.conversationId ?? req.user.id;
    const abortKey = isNewConvo
      ? `${prelimAbortKey}${Constants.COMMON_DIVIDER}${Constants.NEW_CONVO}`
      : prelimAbortKey;
    getReqData({ abortKey });
    const prevRequest = abortControllers.get(abortKey);
    const { overrideUserMessageId } = req?.body ?? {};

    if (overrideUserMessageId != null && prevRequest && prevRequest?.abortController) {
      const data = prevRequest.abortController.getAbortData();
      getReqData({ userMessage: data?.userMessage });
      const addedAbortKey = `${abortKey}:${responseMessageId}`;

      // Store minimal options
      const minimalOptions = {
        endpoint: endpointOption.endpoint,
        iconURL: endpointOption.iconURL,
        model: endpointOption.modelOptions?.model || endpointOption.model_parameters?.model,
      };

      abortControllers.set(addedAbortKey, { abortController, ...minimalOptions });
      const cleanupHandler = createCleanUpHandler(addedAbortKey);
      res.on('finish', cleanupHandler);
      return;
    }

    // Store minimal options
    const minimalOptions = {
      endpoint: endpointOption.endpoint,
      iconURL: endpointOption.iconURL,
      model: endpointOption.modelOptions?.model || endpointOption.model_parameters?.model,
    };

    abortControllers.set(abortKey, { abortController, ...minimalOptions });
    const cleanupHandler = createCleanUpHandler(abortKey);
    res.on('finish', cleanupHandler);
  };

  // Define abortCompletion without capturing the entire parent scope
  abortController.abortCompletion = async function () {
    this.abort();

    // Get data from WeakMap
    const ctrlData = abortDataMap.get(this);
    if (!ctrlData || !ctrlData.getAbortDataFn) {
      return { final: true, conversation: {}, title: 'New Chat' };
    }

    // Get abort data using stored function
    const { conversationId, userMessage, userMessagePromise, promptTokens, ...responseData } =
      ctrlData.getAbortDataFn();

    const completionTokens = await countTokens(responseData?.text ?? '');
    const user = ctrlData.userId;

    const responseMessage = {
      ...responseData,
      conversationId,
      finish_reason: 'incomplete',
      endpoint: ctrlData.endpoint,
      iconURL: ctrlData.iconURL,
      model: ctrlData.modelOptions?.model ?? ctrlData.model_parameters?.model,
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
      // Break reference to promise
      resolved.conversation = null;
    }

    if (!conversation) {
      conversation = await getConvo(user, conversationId);
    }

    return {
      title: conversation && !conversation.title ? null : conversation?.title || 'New Chat',
      final: true,
      conversation,
      requestMessage: userMessage,
      responseMessage: responseMessage,
    };
  };

  return { abortController, onStart };
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

    const callback = createCleanUpHandler(conversationId);
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
