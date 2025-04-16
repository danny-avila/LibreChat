const { getResponseSender } = require('librechat-data-provider');
const {
  handleAbortError,
  createAbortController,
  cleanupAbortController,
} = require('~/server/middleware');
const {
  disposeClient,
  processReqData,
  clientRegistry,
  requestDataMap,
} = require('~/server/cleanup');
const { sendMessage, createOnProgress } = require('~/server/utils');
const { saveMessage } = require('~/models');
const { logger } = require('~/config');

const EditController = async (req, res, next, initializeClient) => {
  let {
    text,
    generation,
    endpointOption,
    conversationId,
    modelDisplayLabel,
    responseMessageId,
    isContinued = false,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;

  let client = null;
  let abortKey = null;
  let cleanupHandlers = [];
  let clientRef = null; // Declare clientRef here

  logger.debug('[EditController]', {
    text,
    generation,
    isContinued,
    conversationId,
    ...endpointOption,
    modelsConfig: endpointOption.modelsConfig ? 'exists' : '',
  });

  let userMessage = null;
  let userMessagePromise = null;
  let promptTokens = null;
  let getAbortData = null;

  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.modelOptions.model,
    modelDisplayLabel,
  });
  const userMessageId = parentMessageId;
  const userId = req.user.id;

  let reqDataContext = { userMessage, userMessagePromise, responseMessageId, promptTokens };

  const updateReqData = (data = {}) => {
    reqDataContext = processReqData(data, reqDataContext);
    abortKey = reqDataContext.abortKey;
    userMessage = reqDataContext.userMessage;
    userMessagePromise = reqDataContext.userMessagePromise;
    responseMessageId = reqDataContext.responseMessageId;
    promptTokens = reqDataContext.promptTokens;
  };

  let { onProgress: progressCallback, getPartialText } = createOnProgress({
    generation,
  });

  const performCleanup = () => {
    logger.debug('[EditController] Performing cleanup');
    if (Array.isArray(cleanupHandlers)) {
      for (const handler of cleanupHandlers) {
        try {
          if (typeof handler === 'function') {
            handler();
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    if (abortKey) {
      logger.debug('[AskController] Cleaning up abort controller');
      cleanupAbortController(abortKey);
      abortKey = null;
    }

    if (client) {
      disposeClient(client);
      client = null;
    }

    reqDataContext = null;
    userMessage = null;
    userMessagePromise = null;
    promptTokens = null;
    getAbortData = null;
    progressCallback = null;
    endpointOption = null;
    cleanupHandlers = null;

    if (requestDataMap.has(req)) {
      requestDataMap.delete(req);
    }
    logger.debug('[EditController] Cleanup completed');
  };

  try {
    ({ client } = await initializeClient({ req, res, endpointOption }));

    if (clientRegistry && client) {
      clientRegistry.register(client, { userId }, client);
    }

    if (client) {
      requestDataMap.set(req, { client });
    }

    clientRef = new WeakRef(client);

    getAbortData = () => {
      const currentClient = clientRef.deref();
      const currentText =
        currentClient?.getStreamText != null ? currentClient.getStreamText() : getPartialText();

      return {
        sender,
        conversationId,
        messageId: reqDataContext.responseMessageId,
        parentMessageId: overrideParentMessageId ?? userMessageId,
        text: currentText,
        userMessage: userMessage,
        userMessagePromise: userMessagePromise,
        promptTokens: reqDataContext.promptTokens,
      };
    };

    const { onStart, abortController } = createAbortController(
      req,
      res,
      getAbortData,
      updateReqData,
    );

    const closeHandler = () => {
      logger.debug('[EditController] Request closed');
      if (!abortController || abortController.signal.aborted || abortController.requestCompleted) {
        return;
      }
      abortController.abort();
      logger.debug('[EditController] Request aborted on close');
    };

    res.on('close', closeHandler);
    cleanupHandlers.push(() => {
      try {
        res.removeListener('close', closeHandler);
      } catch (e) {
        // Ignore
      }
    });

    let response = await client.sendMessage(text, {
      user: userId,
      generation,
      isContinued,
      isEdited: true,
      conversationId,
      parentMessageId,
      responseMessageId: reqDataContext.responseMessageId,
      overrideParentMessageId,
      getReqData: updateReqData,
      onStart,
      abortController,
      progressCallback,
      progressOptions: {
        res,
      },
    });

    const databasePromise = response.databasePromise;
    delete response.databasePromise;

    const { conversation: convoData = {} } = await databasePromise;
    const conversation = { ...convoData };
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    if (client?.options?.attachments && endpointOption?.modelOptions?.model) {
      conversation.model = endpointOption.modelOptions.model;
    }

    if (!abortController.signal.aborted) {
      const finalUserMessage = reqDataContext.userMessage;
      const finalResponseMessage = { ...response };

      sendMessage(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: finalUserMessage,
        responseMessage: finalResponseMessage,
      });
      res.end();

      await saveMessage(
        req,
        { ...finalResponseMessage, user: userId },
        { context: 'api/server/controllers/EditController.js - response end' },
      );
    }

    performCleanup();
  } catch (error) {
    logger.error('[EditController] Error handling request', error);
    let partialText = '';
    try {
      const currentClient = clientRef.deref();
      partialText =
        currentClient?.getStreamText != null ? currentClient.getStreamText() : getPartialText();
    } catch (getTextError) {
      logger.error('[EditController] Error calling getText() during error handling', getTextError);
    }

    handleAbortError(res, req, error, {
      sender,
      partialText,
      conversationId,
      messageId: reqDataContext.responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId ?? parentMessageId,
    })
      .catch((err) => {
        logger.error('[EditController] Error in `handleAbortError` during catch block', err);
      })
      .finally(() => {
        performCleanup();
      });
  }
};

module.exports = EditController;
