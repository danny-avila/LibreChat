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

// Add this only if your Node.js version supports it (Node.js 14+)
const FinalizationRegistry = global.FinalizationRegistry || null;

// Create a finalization registry to help clean up lingering references
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

// Add the following function to the module (outside the main controller)
function disposeClient(client) {
  if (!client) {
    return;
  }

  try {
    // Clear tokenCounter references - this is critical from your profile
    if (client.tokenCounter) {
      client.tokenCounter = null;
    }

    // Clear StandardRun references if they exist
    if (client.run) {
      // Break circular references in run
      if (client.run.tokenCounter) {
        client.run.tokenCounter = null;
      }

      // Clear any callback functions
      if (client.run.callbacks) {
        client.run.callbacks = null;
      }

      client.run = null;
    }

    // Clear other common sources of retention
    if (client.sendMessage) {
      client.sendMessage = null;
    }
    if (client.savedMessageIds) {
      client.savedMessageIds.clear();
      client.savedMessageIds = null;
    }
    if (client.currentMessages) {
      client.currentMessages = null;
    }
    if (client.contentParts) {
      client.contentParts = null;
    }
    if (client.abortController) {
      client.abortController = null;
    }
    if (client.collectedUsage) {
      client.collectedUsage = null;
    }
    if (client.indexTokenCountMap) {
      client.indexTokenCountMap = null;
    }
    if (client.agentConfigs) {
      client.agentConfigs = null;
    }
    if (client.artifactPromises) {
      client.artifactPromises = null;
    }
    if (client.usage) {
      client.usage = null;
    }

    if (typeof client.dispose === 'function') {
      client.dispose();
    }

    client.options = null;
  } catch (e) {
    // Ignore errors during disposal
  }
}

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
  // Initialize as an array
  let cleanupHandlers = [];

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

  // Create a function to handle final cleanup
  const performCleanup = () => {
    // Make sure cleanupHandlers is an array before iterating
    if (Array.isArray(cleanupHandlers)) {
      // Execute all cleanup handlers
      for (const handler of cleanupHandlers) {
        try {
          if (typeof handler === 'function') {
            handler();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }

    // Clean up abort controller
    if (abortKey) {
      cleanupAbortController(abortKey);
    }

    // Dispose client properly
    if (client) {
      disposeClient(client);
    }

    // Clear all references
    client = null;
    getReqData = null;
    userMessage = null;
    getAbortData = null;
    endpointOption = null;
    cleanupHandlers = null;
    userMessagePromise = null;

    // Clear request data map
    if (requestDataMap.has(req)) {
      requestDataMap.delete(req);
    }
  };

  try {
    /** @type {{ client: TAgentClient }} */
    const result = await initializeClient({ req, res, endpointOption });
    client = result.client;

    // Register client with finalization registry if available
    if (clientRegistry) {
      clientRegistry.register(client, { abortKey }, client);
    }

    // Store request data in WeakMap keyed by req object
    requestDataMap.set(req, { client, responseMessageId });

    // Use WeakRef to allow GC but still access content if it exists
    const contentRef = new WeakRef(client.contentParts || []);

    // Minimize closure scope - only capture small primitives and WeakRef
    getAbortData = () => {
      // Dereference WeakRef each time
      const content = contentRef.deref();

      return {
        sender,
        content: content || [],
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

    // Extract tokenCounter reference before sending message
    // This helps break the link to StandardRun
    const tokenCounterRef = client.tokenCounter;
    client.tokenCounter = null;

    // Restore it temporarily for the duration of the call
    client.tokenCounter = tokenCounterRef;
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
      addTitle(req, {
        text,
        response: { ...response },
        client,
      })
        .then(() => {
          logger.debug('[AgentController] Title generation started');
        })
        .catch((err) => {
          logger.error('[AgentController] Error in title generation', err);
        })
        .finally(() => {
          logger.debug('[AgentController] Title generation completed');
          performCleanup();
        });
    } else {
      performCleanup();
    }
  } catch (error) {
    // Handle error without capturing much scope
    handleAbortError(res, req, error, {
      conversationId,
      sender,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId ?? parentMessageId,
    })
      .catch((err) => {
        logger.error('[api/server/controllers/agents/request] Error in `handleAbortError`', err);
      })
      .finally(() => {
        performCleanup();
      });
  }
};

module.exports = AgentController;
