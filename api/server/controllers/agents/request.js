// AgentController.js
const { Constants } = require('librechat-data-provider');
const {
  createAbortController,
  cleanupAbortController,
  handleAbortError,
} = require('~/server/middleware');
const { sendMessage } = require('~/server/utils');
const { saveMessage } = require('~/models');
const { logger } = require('~/config');

// WeakMap to hold temporary data associated with requests
const requestDataMap = new WeakMap();

const AgentController = async (req, res, next, initializeClient, addTitle) => {
  let {
    text,
    endpointOption,
    conversationId,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;

  let sender;
  let abortKey;
  let userMessage;
  let promptTokens;
  let userMessageId;
  let responseMessageId;
  let userMessagePromise;
  let getAbortData;
  let client = null;

  const newConvo = !conversationId;
  const user = req.user.id;

  // Create handler to avoid capturing the entire parent scope
  let getReqData = (data = {}) => {
    for (let key in data) {
      if (key === 'userMessage') {
        userMessage = data[key];
        userMessageId = data[key].messageId;
      } else if (key === 'userMessagePromise') {
        userMessagePromise = data[key];
      } else if (key === 'responseMessageId') {
        responseMessageId = data[key];
      } else if (key === 'promptTokens') {
        promptTokens = data[key];
      } else if (key === 'sender') {
        sender = data[key];
      } else if (!conversationId && key === 'conversationId') {
        conversationId = data[key];
      }
    }
  };

  try {
    /** @type {{ client: TAgentClient }} */
    const result = await initializeClient({ req, res, endpointOption });
    client = result.client;

    // Store request data in WeakMap keyed by req object
    requestDataMap.set(req, { client, responseMessageId });

    // Use WeakRef to allow GC but still access content if it exists
    const contentRef = new WeakRef(client.contentParts);

    // Minimize closure scope - only capture small primitives and WeakRef
    getAbortData = () => {
      // Dereference WeakRef each time
      const content = contentRef.deref();

      return {
        sender,
        content,
        userMessage,
        promptTokens,
        conversationId,
        userMessagePromise,
        messageId: responseMessageId,
        parentMessageId: overrideParentMessageId ?? userMessageId,
      };
    };

    const {
      abortController,
      onStart,
      abortKey: _aK,
    } = createAbortController(req, res, getAbortData, getReqData);
    abortKey = _aK;

    // Simple handler to avoid capturing scope
    const closeHandler = () => {
      logger.debug('[AgentController] Request closed');
      if (!abortController) {
        return;
      } else if (abortController.signal.aborted) {
        return;
      } else if (abortController.requestCompleted) {
        return;
      }

      abortController.abort();
      logger.debug('[AgentController] Request aborted on close');
    };

    // Add with named handler so we can remove it later
    res.on('close', closeHandler);

    // Clean up on finish
    res.on('finish', () => {
      try {
        // Remove the close handler
        res.removeListener('close', closeHandler);
        // Clean up request data
        if (requestDataMap.has(req)) {
          requestDataMap.delete(req);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    const messageOptions = {
      user,
      onStart,
      getReqData,
      conversationId,
      parentMessageId,
      abortController,
      overrideParentMessageId,
      progressOptions: {
        res,
      },
    };

    let response = await client.sendMessage(text, messageOptions);

    // Extract what we need and immediately break reference
    const messageId = response.messageId;
    const endpoint = endpointOption.endpoint;
    response.endpoint = endpoint;

    // Store database promise locally
    const databasePromise = response.databasePromise;
    delete response.databasePromise;

    // Resolve database-related data
    const { conversation: convoData = {} } = await databasePromise;
    const conversation = { ...convoData };
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    // Process files if needed
    if (req.body.files && client.options?.attachments) {
      userMessage.files = [];
      const messageFiles = new Set(req.body.files.map((file) => file.file_id));
      for (let attachment of client.options.attachments) {
        if (messageFiles.has(attachment.file_id)) {
          userMessage.files.push({ ...attachment });
        }
      }
      delete userMessage.image_urls;
    }

    // Only send if not aborted
    if (!abortController.signal.aborted) {
      // Create a new response object with minimal copies
      const finalResponse = { ...response };

      sendMessage(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: userMessage,
        responseMessage: finalResponse,
      });
      res.end();

      // Save the message if needed
      if (client.savedMessageIds && !client.savedMessageIds.has(messageId)) {
        await saveMessage(
          req,
          { ...finalResponse, user },
          { context: 'api/server/controllers/agents/request.js - response end' },
        );
      }
    }

    // Save user message if needed
    if (!client.skipSaveUserMessage) {
      await saveMessage(req, userMessage, {
        context: 'api/server/controllers/agents/request.js - don\'t skip saving user message',
      });
    }

    // Add title if needed - extract minimal data
    if (addTitle && parentMessageId === Constants.NO_PARENT && newConvo) {
      // Extract minimal data for title generation
      const titleData = {
        text,
        response: { ...response },
        clientProps: {
          endpoint: client.options?.endpoint,
          modelName: client.options?.modelOptions?.model,
        },
      };

      // Break reference to client
      addTitle(req, titleData);
    }
  } catch (error) {
    // Handle error without capturing much scope
    handleAbortError(res, req, error, {
      conversationId,
      sender,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId ?? parentMessageId,
    }).catch((err) => {
      logger.error('[api/server/controllers/agents/request] Error in `handleAbortError`', err);
    });
  } finally {
    // Thorough cleanup
    if (abortKey) {
      cleanupAbortController(abortKey);
    }

    // Clear all references
    getReqData = null;
    getAbortData = null;
    client = null;
    userMessage = null;
    userMessagePromise = null;

    // Clean up request data
    if (requestDataMap.has(req)) {
      requestDataMap.delete(req);
    }
  }
};

module.exports = AgentController;
