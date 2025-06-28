const { logger } = require('~/config');

// WeakMap to hold temporary data associated with requests
const requestDataMap = new WeakMap();

const FinalizationRegistry = global.FinalizationRegistry || null;

/**
 * FinalizationRegistry to clean up client objects when they are garbage collected.
 * This is used to prevent memory leaks and ensure that client objects are
 * properly disposed of when they are no longer needed.
 * The registry holds a weak reference to the client object and a cleanup
 * callback that is called when the client object is garbage collected.
 * The callback can be used to perform any necessary cleanup operations,
 * such as removing event listeners or freeing up resources.
 */
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

/**
 * Cleans up the client object by removing references to its properties.
 * This is useful for preventing memory leaks and ensuring that the client
 * and its properties can be garbage collected when it is no longer needed.
 */
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
    if (client.message_file_map) {
      client.message_file_map = null;
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
    if (client.skipSaveUserMessage !== undefined) {
      client.skipSaveUserMessage = null;
    }
    if (client.visionMode) {
      client.visionMode = null;
    }
    if (client.continued !== undefined) {
      client.continued = null;
    }
    if (client.fetchedConvo !== undefined) {
      client.fetchedConvo = null;
    }
    if (client.previous_summary) {
      client.previous_summary = null;
    }
    if (client.metadata) {
      client.metadata = null;
    }
    if (client.isVisionModel) {
      client.isVisionModel = null;
    }
    if (client.isChatCompletion !== undefined) {
      client.isChatCompletion = null;
    }
    if (client.contextHandlers) {
      client.contextHandlers = null;
    }
    if (client.augmentedPrompt) {
      client.augmentedPrompt = null;
    }
    if (client.systemMessage) {
      client.systemMessage = null;
    }
    if (client.azureEndpoint) {
      client.azureEndpoint = null;
    }
    if (client.langchainProxy) {
      client.langchainProxy = null;
    }
    if (client.isOmni !== undefined) {
      client.isOmni = null;
    }
    if (client.runManager) {
      client.runManager = null;
    }
    // Properties specific to AnthropicClient
    if (client.message_start) {
      client.message_start = null;
    }
    if (client.message_delta) {
      client.message_delta = null;
    }
    if (client.isClaudeLatest !== undefined) {
      client.isClaudeLatest = null;
    }
    if (client.useMessages !== undefined) {
      client.useMessages = null;
    }
    if (client.supportsCacheControl !== undefined) {
      client.supportsCacheControl = null;
    }
    // Properties specific to GoogleClient
    if (client.serviceKey) {
      client.serviceKey = null;
    }
    if (client.project_id) {
      client.project_id = null;
    }
    if (client.client_email) {
      client.client_email = null;
    }
    if (client.private_key) {
      client.private_key = null;
    }
    if (client.access_token) {
      client.access_token = null;
    }
    if (client.reverseProxyUrl) {
      client.reverseProxyUrl = null;
    }
    if (client.authHeader) {
      client.authHeader = null;
    }
    if (client.isGenerativeModel !== undefined) {
      client.isGenerativeModel = null;
    }
    // Properties specific to OpenAIClient
    if (client.completionsUrl) {
      client.completionsUrl = null;
    }
    if (client.shouldSummarize !== undefined) {
      client.shouldSummarize = null;
    }
    if (client.isOllama !== undefined) {
      client.isOllama = null;
    }
    if (client.FORCE_PROMPT !== undefined) {
      client.FORCE_PROMPT = null;
    }
    if (client.isChatGptModel !== undefined) {
      client.isChatGptModel = null;
    }
    if (client.isUnofficialChatGptModel !== undefined) {
      client.isUnofficialChatGptModel = null;
    }
    if (client.useOpenRouter !== undefined) {
      client.useOpenRouter = null;
    }
    if (client.startToken) {
      client.startToken = null;
    }
    if (client.endToken) {
      client.endToken = null;
    }
    if (client.userLabel) {
      client.userLabel = null;
    }
    if (client.chatGptLabel) {
      client.chatGptLabel = null;
    }
    if (client.modelLabel) {
      client.modelLabel = null;
    }
    if (client.modelOptions) {
      client.modelOptions = null;
    }
    if (client.defaultVisionModel) {
      client.defaultVisionModel = null;
    }
    if (client.maxPromptTokens) {
      client.maxPromptTokens = null;
    }
    if (client.maxResponseTokens) {
      client.maxResponseTokens = null;
    }
    if (client.processMemory) {
      client.processMemory = null;
    }
    if (client.run) {
      // Break circular references in run
      if (client.run.Graph) {
        client.run.Graph.resetValues();
        client.run.Graph.handlerRegistry = null;
        client.run.Graph.runId = null;
        client.run.Graph.tools = null;
        client.run.Graph.signal = null;
        client.run.Graph.config = null;
        client.run.Graph.toolEnd = null;
        client.run.Graph.toolMap = null;
        client.run.Graph.provider = null;
        client.run.Graph.streamBuffer = null;
        client.run.Graph.clientOptions = null;
        client.run.Graph.graphState = null;
        if (client.run.Graph.boundModel?.client) {
          client.run.Graph.boundModel.client = null;
        }
        client.run.Graph.boundModel = null;
        client.run.Graph.systemMessage = null;
        client.run.Graph.reasoningKey = null;
        client.run.Graph.messages = null;
        client.run.Graph.contentData = null;
        client.run.Graph.stepKeyIds = null;
        client.run.Graph.contentIndexMap = null;
        client.run.Graph.toolCallStepIds = null;
        client.run.Graph.messageIdsByStepKey = null;
        client.run.Graph.messageStepHasToolCalls = null;
        client.run.Graph.prelimMessageIdsByStepKey = null;
        client.run.Graph.currentTokenType = null;
        client.run.Graph.lastToken = null;
        client.run.Graph.tokenTypeSwitch = null;
        client.run.Graph.indexTokenCountMap = null;
        client.run.Graph.currentUsage = null;
        client.run.Graph.tokenCounter = null;
        client.run.Graph.maxContextTokens = null;
        client.run.Graph.pruneMessages = null;
        client.run.Graph.lastStreamCall = null;
        client.run.Graph.startIndex = null;
        client.run.Graph = null;
      }
      if (client.run.handlerRegistry) {
        client.run.handlerRegistry = null;
      }
      if (client.run.graphRunnable) {
        if (client.run.graphRunnable.channels) {
          client.run.graphRunnable.channels = null;
        }
        if (client.run.graphRunnable.nodes) {
          client.run.graphRunnable.nodes = null;
        }
        if (client.run.graphRunnable.lc_kwargs) {
          client.run.graphRunnable.lc_kwargs = null;
        }
        if (client.run.graphRunnable.builder?.nodes) {
          client.run.graphRunnable.builder.nodes = null;
          client.run.graphRunnable.builder = null;
        }
        client.run.graphRunnable = null;
      }
      client.run = null;
    }
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
