const { getResponseSender } = require('librechat-data-provider');
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
    if (client.tokenCounter) {
      client.tokenCounter = null;
    }
    if (client.req) {
      client.req = null;
    }
    if (client.res) {
      client.res = null;
    }
    if (client.sendMessage) {
      client.sendMessage = null;
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

let getReqData = (data = {}, context) => {
  let { userMessage, userMessagePromise, responseMessageId, promptTokens } = context;
  for (const key in data) {
    if (key === 'userMessage') {
      userMessage = data[key];
    } else if (key === 'userMessagePromise') {
      userMessagePromise = data[key];
    } else if (key === 'responseMessageId') {
      responseMessageId = data[key];
    } else if (key === 'promptTokens') {
      promptTokens = data[key];
    }
  }
  return { userMessage, userMessagePromise, responseMessageId, promptTokens };
};

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
  const user = req.user.id;

  let reqDataContext = { userMessage, userMessagePromise, responseMessageId, promptTokens };

  const updateReqData = (data = {}) => {
    reqDataContext = getReqData(data, reqDataContext);
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
      cleanupAbortController(abortKey);
      abortKey = null;
    }

    if (client) {
      disposeClient(client);
      client = null;
    }

    getReqData = null;
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
      user,
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
        { ...finalResponseMessage, user },
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
