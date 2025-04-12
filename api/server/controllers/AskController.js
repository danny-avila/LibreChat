const { getResponseSender, Constants } = require('librechat-data-provider');
const {
  createAbortController,
  cleanupAbortController,
  handleAbortError,
} = require('~/server/middleware');
const { sendMessage, createOnProgress } = require('~/server/utils');
const { saveMessage } = require('~/models');
const { logger } = require('~/config');

const requestDataMap = new WeakMap();
const FinalizationRegistry = global.FinalizationRegistry || null;

const clientRegistry = FinalizationRegistry
  ? new FinalizationRegistry((heldValue) => {
    try {
      // This will run when the client is garbage collected
      if (heldValue && heldValue.abortKey) {
        cleanupAbortController(heldValue.abortKey);
      }
    } catch (e) {
      // Ignore errors
    }
  })
  : null;

function disposeClient(client) {
  if (!client) {
    return;
  }
  try {
    if (client.apiKey) {
      client.apiKey = null;
    }
    if (client.azure) {
      client.azure = null;
    }
    if (client.sendMessage) {
      client.sendMessage = null;
    }
    if (client.currentMessages) {
      client.currentMessages = null;
    }
    if (client.getBuildMessages) {
      client.getBuildMessages = null;
    }
    if (client.getResponseSender) {
      client.getResponseSender = null;
    }
    if (client.currentMessages) {
      client.currentMessages = null;
    }
    if (client.streamHandler) {
      client.streamHandler = null;
    }
    if (client.abortController) {
      client.abortController = null;
    }
    if (client.options) {
      client.options = null;
    }
    if (client.savedMessageIds) {
      client.savedMessageIds.clear();
      client.savedMessageIds = null;
    }
    if (typeof client.dispose === 'function') {
      client.dispose();
    }
  } catch (e) {
    // Ignore
  }
}

function processReqData(data = {}, context) {
  let {
    userMessage,
    userMessagePromise,
    responseMessageId,
    promptTokens,
    conversationId,
    userMessageId,
  } = context;
  for (const key in data) {
    if (key === 'userMessage') {
      userMessage = data[key];
      userMessageId = data[key].messageId;
    } else if (key === 'userMessagePromise') {
      userMessagePromise = data[key];
    } else if (key === 'responseMessageId') {
      responseMessageId = data[key];
    } else if (key === 'promptTokens') {
      promptTokens = data[key];
    } else if (!conversationId && key === 'conversationId') {
      conversationId = data[key];
    }
  }
  return {
    userMessage,
    userMessagePromise,
    responseMessageId,
    promptTokens,
    conversationId,
    userMessageId,
  };
}

const AskController = async (req, res, next, initializeClient, addTitle) => {
  let {
    text,
    endpointOption,
    conversationId,
    modelDisplayLabel,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;

  let client = null;
  let abortKey = null;
  let cleanupHandlers = [];
  let clientRef = null;

  logger.debug('[AskController]', {
    text,
    conversationId,
    ...endpointOption,
    modelsConfig: endpointOption?.modelsConfig ? 'exists' : '',
  });

  let userMessage = null;
  let userMessagePromise = null;
  let promptTokens = null;
  let userMessageId = null;
  let responseMessageId = null;
  let getAbortData = null;

  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.modelOptions.model,
    modelDisplayLabel,
  });
  const initialConversationId = conversationId;
  const newConvo = !initialConversationId;
  const user = req.user.id;

  let reqDataContext = {
    userMessage,
    userMessagePromise,
    responseMessageId,
    promptTokens,
    conversationId,
    userMessageId,
  };

  const updateReqData = (data = {}) => {
    reqDataContext = processReqData(data, reqDataContext);
    userMessage = reqDataContext.userMessage;
    userMessagePromise = reqDataContext.userMessagePromise;
    responseMessageId = reqDataContext.responseMessageId;
    promptTokens = reqDataContext.promptTokens;
    conversationId = reqDataContext.conversationId;
    userMessageId = reqDataContext.userMessageId;
  };

  let { onProgress: progressCallback, getPartialText } = createOnProgress();

  const performCleanup = () => {
    logger.debug('[AskController] Performing cleanup');
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
    addTitle = null;

    if (requestDataMap.has(req)) {
      requestDataMap.delete(req);
    }
    logger.debug('[AskController] Cleanup completed');
  };

  try {
    const initResult = await initializeClient({ req, res, endpointOption });
    client = initResult.client;

    if (clientRegistry && client) {
      clientRegistry.register(client, { abortKey }, client);
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

    const {
      abortController,
      onStart,
      abortKey: _aK,
    } = createAbortController(req, res, getAbortData, updateReqData);
    abortKey = _aK;

    const closeHandler = () => {
      logger.debug('[AskController] Request closed');
      if (!abortController || abortController.signal.aborted || abortController.requestCompleted) {
        return;
      }
      abortController.abort();
      logger.debug('[AskController] Request aborted on close');
    };

    res.on('close', closeHandler);
    cleanupHandlers.push(() => {
      try {
        res.removeListener('close', closeHandler);
      } catch (e) {
        // Ignore
      }
    });

    const messageOptions = {
      user,
      parentMessageId,
      conversationId: reqDataContext.conversationId,
      overrideParentMessageId,
      getReqData: updateReqData,
      onStart,
      abortController,
      progressCallback,
      progressOptions: {
        res,
      },
    };

    /** @type {TMessage} */
    let response = await client.sendMessage(text, messageOptions);
    response.endpoint = endpointOption.endpoint;

    const databasePromise = response.databasePromise;
    delete response.databasePromise;

    const { conversation: convoData = {} } = await databasePromise;
    const conversation = { ...convoData };
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    const latestUserMessage = reqDataContext.userMessage;

    if (client?.options?.attachments && latestUserMessage) {
      latestUserMessage.files = client.options.attachments;
      if (endpointOption?.modelOptions?.model) {
        conversation.model = endpointOption.modelOptions.model;
      }
      delete latestUserMessage.image_urls;
    }

    if (!abortController.signal.aborted) {
      const finalResponseMessage = { ...response };

      sendMessage(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: latestUserMessage,
        responseMessage: finalResponseMessage,
      });
      res.end();

      if (client?.savedMessageIds && !client.savedMessageIds.has(response.messageId)) {
        await saveMessage(
          req,
          { ...finalResponseMessage, user },
          { context: 'api/server/controllers/AskController.js - response end' },
        );
      }
    }

    if (!client?.skipSaveUserMessage && latestUserMessage) {
      await saveMessage(req, latestUserMessage, {
        context: 'api/server/controllers/AskController.js - don\'t skip saving user message',
      });
    }

    if (
      typeof addTitle === 'function' &&
      parentMessageId === Constants.NO_PARENT &&
      newConvo &&
      !abortController.signal.aborted
    ) {
      const titleResponse = { ...response };

      // Pass the full client object as requested
      addTitle(req, {
        text,
        response: titleResponse,
        client: client, // Pass the actual client object
      })
        .then(() => {
          logger.debug('[AskController] Title generation started');
        })
        .catch((err) => {
          logger.error('[AskController] Error in title generation', err);
        })
        .finally(() => {
          logger.debug('[AskController] Title generation completed');
          performCleanup();
        });
    } else {
      performCleanup();
    }
  } catch (error) {
    logger.error('[AskController] Error handling request', error);
    let partialText = '';
    try {
      const currentClient = clientRef.deref();
      partialText =
        currentClient?.getStreamText != null ? currentClient.getStreamText() : getPartialText();
    } catch (getTextError) {
      logger.error('[AskController] Error calling getText() during error handling', getTextError);
    }

    handleAbortError(res, req, error, {
      sender,
      partialText,
      conversationId: reqDataContext.conversationId,
      messageId: reqDataContext.responseMessageId,
      parentMessageId: overrideParentMessageId ?? reqDataContext.userMessageId ?? parentMessageId,
    })
      .catch((err) => {
        logger.error('[AskController] Error in `handleAbortError` during catch block', err);
      })
      .finally(() => {
        performCleanup();
      });
  }
};

module.exports = AskController;
