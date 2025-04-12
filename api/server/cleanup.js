const { logger } = require('~/config');

// WeakMap to hold temporary data associated with requests
const requestDataMap = new WeakMap();

const FinalizationRegistry = global.FinalizationRegistry || null;

// Create a finalization registry to help clean up lingering references
const clientRegistry = FinalizationRegistry
  ? new FinalizationRegistry((heldValue) => {
    try {
      // This will run when the client is garbage collected
      if (heldValue && heldValue.userId) {
        logger.debug(`[FinalizationRegistry] Cleaning up client for user ${heldValue.userId}`);
      } else {
        logger.debug('[FinalizationRegistry] Cleaning up client');
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
    if (client.user) {
      client.user = null;
    }
    if (client.apiKey) {
      client.apiKey = null;
    }
    if (client.azure) {
      client.azure = null;
    }
    if (client.conversationId) {
      client.conversationId = null;
    }
    if (client.responseMessageId) {
      client.responseMessageId = null;
    }
    if (client.clientName) {
      client.clientName = null;
    }
    if (client.sender) {
      client.sender = null;
    }
    if (client.model) {
      client.model = null;
    }
    if (client.maxContextTokens) {
      client.maxContextTokens = null;
    }
    if (client.contextStrategy) {
      client.contextStrategy = null;
    }
    if (client.currentDateString) {
      client.currentDateString = null;
    }
    if (client.inputTokensKey) {
      client.inputTokensKey = null;
    }
    if (client.outputTokensKey) {
      client.outputTokensKey = null;
    }
    if (client.run) {
      // Break circular references in run
      if (client.run.Graph) {
        client.run.Graph.resetValues();
        client.run.Graph = null;
      }
      if (client.run.handlerRegistry) {
        client.run.handlerRegistry = null;
      }
      if (client.run.graphRunnable) {
        client.run.graphRunnable = null;
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
    if (client.streamHandler) {
      client.streamHandler = null;
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

    if (client.options) {
      if (client.options.req) {
        client.options.req = null;
      }
      if (client.options.res) {
        client.options.res = null;
      }
      if (client.options.attachments) {
        client.options.attachments = null;
      }
      if (client.options.agent) {
        client.options.agent = null;
      }
    }
    client.options = null;
  } catch (e) {
    // Ignore errors during disposal
  }
}

function processReqData(data = {}, context) {
  let {
    abortKey,
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
    } else if (key === 'abortKey') {
      abortKey = data[key];
    } else if (!conversationId && key === 'conversationId') {
      conversationId = data[key];
    }
  }
  return {
    abortKey,
    userMessage,
    userMessagePromise,
    responseMessageId,
    promptTokens,
    conversationId,
    userMessageId,
  };
}

module.exports = {
  disposeClient,
  requestDataMap,
  clientRegistry,
  processReqData,
};
