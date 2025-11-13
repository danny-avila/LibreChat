require('events').EventEmitter.defaultMaxListeners = 100;
const { logger } = require('@librechat/data-schemas');
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { getBufferString, HumanMessage } = require('@langchain/core/messages');
const {
  createRun,
  Tokenizer,
  checkAccess,
  logAxiosError,
  sanitizeTitle,
  resolveHeaders,
  getBalanceConfig,
  memoryInstructions,
  getTransactionsConfig,
  createMemoryProcessor,
} = require('@librechat/api');
const {
  Callback,
  Providers,
  TitleMethod,
  formatMessage,
  formatAgentMessages,
  getTokenCountForMessage,
  createMetadataAggregator,
} = require('@librechat/agents');
const {
  Constants,
  Permissions,
  VisionModes,
  ContentTypes,
  EModelEndpoint,
  PermissionTypes,
  isAgentsEndpoint,
  AgentCapabilities,
  bedrockInputSchema,
  removeNullishValues,
} = require('librechat-data-provider');
const { initializeAgent } = require('~/server/services/Endpoints/agents/agent');
const { spendTokens, spendStructuredTokens } = require('~/models/spendTokens');
const { getFormattedMemories, deleteMemory, setMemory } = require('~/models');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { getProviderConfig } = require('~/server/services/Endpoints');
const { createContextHandlers } = require('~/app/clients/prompts');
const { checkCapability } = require('~/server/services/Config');
const BaseClient = require('~/app/clients/BaseClient');
const { getRoleByName } = require('~/models/Role');
const { loadAgent } = require('~/models/Agent');
const { getMCPManager } = require('~/config');

const omitTitleOptions = new Set([
  'stream',
  'thinking',
  'streaming',
  'clientOptions',
  'thinkingConfig',
  'thinkingBudget',
  'includeThoughts',
  'maxOutputTokens',
  'additionalModelRequestFields',
]);

/**
 * @param {ServerRequest} req
 * @param {Agent} agent
 * @param {string} endpoint
 */
const payloadParser = ({ req, agent, endpoint }) => {
  if (isAgentsEndpoint(endpoint)) {
    return { model: undefined };
  } else if (endpoint === EModelEndpoint.bedrock) {
    const parsedValues = bedrockInputSchema.parse(agent.model_parameters);
    if (parsedValues.thinking == null) {
      parsedValues.thinking = false;
    }
    return parsedValues;
  }
  return req.body.endpointOption.model_parameters;
};

function createTokenCounter(encoding) {
  return function (message) {
    const countTokens = (text) => Tokenizer.getTokenCount(text, encoding);
    return getTokenCountForMessage(message, countTokens);
  };
}

function logToolError(graph, error, toolId) {
  logAxiosError({
    error,
    message: `[api/server/controllers/agents/client.js #chatCompletion] Tool Error "${toolId}"`,
  });
}

class AgentClient extends BaseClient {
  constructor(options = {}) {
    super(null, options);
    /** The current client class
     * @type {string} */
    this.clientName = EModelEndpoint.agents;

    /** @type {'discard' | 'summarize'} */
    this.contextStrategy = 'discard';

    /** @deprecated @type {true} - Is a Chat Completion Request */
    this.isChatCompletion = true;

    /** @type {AgentRun} */
    this.run;

    const {
      agentConfigs,
      contentParts,
      collectedUsage,
      artifactPromises,
      maxContextTokens,
      ...clientOptions
    } = options;

    this.agentConfigs = agentConfigs;
    this.maxContextTokens = maxContextTokens;
    /** @type {MessageContentComplex[]} */
    this.contentParts = contentParts;
    /** @type {Array<UsageMetadata>} */
    this.collectedUsage = collectedUsage;
    /** @type {ArtifactPromises} */
    this.artifactPromises = artifactPromises;
    /** @type {AgentClientOptions} */
    this.options = Object.assign({ endpoint: options.endpoint }, clientOptions);
    /** @type {string} */
    this.model = this.options.agent.model_parameters.model;
    /** The key for the usage object's input tokens
     * @type {string} */
    this.inputTokensKey = 'input_tokens';
    /** The key for the usage object's output tokens
     * @type {string} */
    this.outputTokensKey = 'output_tokens';
    /** @type {UsageMetadata} */
    this.usage;
    /** @type {Record<string, number>} */
    this.indexTokenCountMap = {};
    /** @type {(messages: BaseMessage[]) => Promise<void>} */
    this.processMemory;
  }

  /**
   * Returns the aggregated content parts for the current run.
   * @returns {MessageContentComplex[]} */
  getContentParts() {
    return this.contentParts;
  }

  setOptions(options) {
    logger.info('[api/server/controllers/agents/client.js] setOptions', options);
  }

  /**
   * `AgentClient` is not opinionated about vision requests, so we don't do anything here
   * @param {MongoFile[]} attachments
   */
  checkVisionRequest() {}

  getSaveOptions() {
    // TODO:
    // would need to be override settings; otherwise, model needs to be undefined
    // model: this.override.model,
    // instructions: this.override.instructions,
    // additional_instructions: this.override.additional_instructions,
    let runOptions = {};
    try {
      runOptions = payloadParser(this.options);
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #getSaveOptions] Error parsing options',
        error,
      );
    }

    return removeNullishValues(
      Object.assign(
        {
          endpoint: this.options.endpoint,
          agent_id: this.options.agent.id,
          modelLabel: this.options.modelLabel,
          maxContextTokens: this.options.maxContextTokens,
          resendFiles: this.options.resendFiles,
          imageDetail: this.options.imageDetail,
          spec: this.options.spec,
          iconURL: this.options.iconURL,
        },
        // TODO: PARSE OPTIONS BY PROVIDER, MAY CONTAIN SENSITIVE DATA
        runOptions,
      ),
    );
  }

  getBuildMessagesOptions() {
    return {
      instructions: this.options.agent.instructions,
      additional_instructions: this.options.agent.additional_instructions,
    };
  }

  /**
   *
   * @param {TMessage} message
   * @param {Array<MongoFile>} attachments
   * @returns {Promise<Array<Partial<MongoFile>>>}
   */
  async addImageURLs(message, attachments) {
    const { files, image_urls } = await encodeAndFormat(
      this.options.req,
      attachments,
      this.options.agent.provider,
      VisionModes.agents,
    );
    message.image_urls = image_urls.length ? image_urls : undefined;
    return files;
  }

  async buildMessages(
    messages,
    parentMessageId,
    { instructions = null, additional_instructions = null },
    opts,
  ) {
    let orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
      summary: this.shouldSummarize,
    });

    let payload;
    /** @type {number | undefined} */
    let promptTokens;

    /** @type {string} */
    let systemContent = [instructions ?? '', additional_instructions ?? '']
      .filter(Boolean)
      .join('\n')
      .trim();

    if (this.options.attachments) {
      const attachments = await this.options.attachments;
      const latestMessage = orderedMessages[orderedMessages.length - 1];

      if (this.message_file_map) {
        this.message_file_map[latestMessage.messageId] = attachments;
      } else {
        this.message_file_map = {
          [latestMessage.messageId]: attachments,
        };
      }

      await this.addFileContextToMessage(latestMessage, attachments);
      const files = await this.processAttachments(latestMessage, attachments);

      this.options.attachments = files;
    }

    /** Note: Bedrock uses legacy RAG API handling */
    if (this.message_file_map && !isAgentsEndpoint(this.options.endpoint)) {
      this.contextHandlers = createContextHandlers(
        this.options.req,
        orderedMessages[orderedMessages.length - 1].text,
      );
    }

    const formattedMessages = orderedMessages.map((message, i) => {
      const formattedMessage = formatMessage({
        message,
        userName: this.options?.name,
        assistantName: this.options?.modelLabel,
      });

      if (message.fileContext && i !== orderedMessages.length - 1) {
        if (typeof formattedMessage.content === 'string') {
          formattedMessage.content = message.fileContext + '\n' + formattedMessage.content;
        } else {
          const textPart = formattedMessage.content.find((part) => part.type === 'text');
          textPart
            ? (textPart.text = message.fileContext + '\n' + textPart.text)
            : formattedMessage.content.unshift({ type: 'text', text: message.fileContext });
        }
      } else if (message.fileContext && i === orderedMessages.length - 1) {
        systemContent = [systemContent, message.fileContext].join('\n');
      }

      const needsTokenCount =
        (this.contextStrategy && !orderedMessages[i].tokenCount) || message.fileContext;

      /* If tokens were never counted, or, is a Vision request and the message has files, count again */
      if (needsTokenCount || (this.isVisionModel && (message.image_urls || message.files))) {
        orderedMessages[i].tokenCount = this.getTokenCountForMessage(formattedMessage);
      }

      /* If message has files, calculate image token cost */
      if (this.message_file_map && this.message_file_map[message.messageId]) {
        const attachments = this.message_file_map[message.messageId];
        for (const file of attachments) {
          if (file.embedded) {
            this.contextHandlers?.processFile(file);
            continue;
          }
          if (file.metadata?.fileIdentifier) {
            continue;
          }
          // orderedMessages[i].tokenCount += this.calculateImageTokenCost({
          //   width: file.width,
          //   height: file.height,
          //   detail: this.options.imageDetail ?? ImageDetail.auto,
          // });
        }
      }

      return formattedMessage;
    });

    if (this.contextHandlers) {
      this.augmentedPrompt = await this.contextHandlers.createContext();
      systemContent = this.augmentedPrompt + systemContent;
    }

    // Inject MCP server instructions if available
    const ephemeralAgent = this.options.req.body.ephemeralAgent;
    let mcpServers = [];

    // Check for ephemeral agent MCP servers
    if (ephemeralAgent && ephemeralAgent.mcp && ephemeralAgent.mcp.length > 0) {
      mcpServers = ephemeralAgent.mcp;
    }
    // Check for regular agent MCP tools
    else if (this.options.agent && this.options.agent.tools) {
      mcpServers = this.options.agent.tools
        .filter(
          (tool) =>
            tool instanceof DynamicStructuredTool && tool.name.includes(Constants.mcp_delimiter),
        )
        .map((tool) => tool.name.split(Constants.mcp_delimiter).pop())
        .filter(Boolean);
    }

    if (mcpServers.length > 0) {
      try {
        const mcpInstructions = getMCPManager().formatInstructionsForContext(mcpServers);
        if (mcpInstructions) {
          systemContent = [systemContent, mcpInstructions].filter(Boolean).join('\n\n');
          logger.debug('[AgentClient] Injected MCP instructions for servers:', mcpServers);
        }
      } catch (error) {
        logger.error('[AgentClient] Failed to inject MCP instructions:', error);
      }
    }

    if (systemContent) {
      this.options.agent.instructions = systemContent;
    }

    /** @type {Record<string, number> | undefined} */
    let tokenCountMap;

    if (this.contextStrategy) {
      ({ payload, promptTokens, tokenCountMap, messages } = await this.handleContextStrategy({
        orderedMessages,
        formattedMessages,
      }));
    }

    for (let i = 0; i < messages.length; i++) {
      this.indexTokenCountMap[i] = messages[i].tokenCount;
    }

    const result = {
      tokenCountMap,
      prompt: payload,
      promptTokens,
      messages,
    };

    if (promptTokens >= 0 && typeof opts?.getReqData === 'function') {
      opts.getReqData({ promptTokens });
    }

    const withoutKeys = await this.useMemory();
    if (withoutKeys) {
      systemContent += `${memoryInstructions}\n\n# Existing memory about the user:\n${withoutKeys}`;
    }

    if (systemContent) {
      this.options.agent.instructions = systemContent;
    }

    return result;
  }

  /**
   * Creates a promise that resolves with the memory promise result or undefined after a timeout
   * @param {Promise<(TAttachment | null)[] | undefined>} memoryPromise - The memory promise to await
   * @param {number} timeoutMs - Timeout in milliseconds (default: 3000)
   * @returns {Promise<(TAttachment | null)[] | undefined>}
   */
  async awaitMemoryWithTimeout(memoryPromise, timeoutMs = 3000) {
    if (!memoryPromise) {
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Memory processing timeout')), timeoutMs),
      );

      const attachments = await Promise.race([memoryPromise, timeoutPromise]);
      return attachments;
    } catch (error) {
      if (error.message === 'Memory processing timeout') {
        logger.warn('[AgentClient] Memory processing timed out after 3 seconds');
      } else {
        logger.error('[AgentClient] Error processing memory:', error);
      }
      return;
    }
  }

  /**
   * @returns {Promise<string | undefined>}
   */
  async useMemory() {
    const user = this.options.req.user;
    if (user.personalization?.memories === false) {
      return;
    }
    const hasAccess = await checkAccess({
      user,
      permissionType: PermissionTypes.MEMORIES,
      permissions: [Permissions.USE],
      getRoleByName,
    });

    if (!hasAccess) {
      logger.debug(
        `[api/server/controllers/agents/client.js #useMemory] User ${user.id} does not have USE permission for memories`,
      );
      return;
    }
    const appConfig = this.options.req.config;
    const memoryConfig = appConfig.memory;
    if (!memoryConfig || memoryConfig.disabled === true) {
      return;
    }

    /** @type {Agent} */
    let prelimAgent;
    const allowedProviders = new Set(
      appConfig?.endpoints?.[EModelEndpoint.agents]?.allowedProviders,
    );
    try {
      if (memoryConfig.agent?.id != null && memoryConfig.agent.id !== this.options.agent.id) {
        prelimAgent = await loadAgent({
          req: this.options.req,
          agent_id: memoryConfig.agent.id,
          endpoint: EModelEndpoint.agents,
        });
      } else if (
        memoryConfig.agent?.id == null &&
        memoryConfig.agent?.model != null &&
        memoryConfig.agent?.provider != null
      ) {
        prelimAgent = { id: Constants.EPHEMERAL_AGENT_ID, ...memoryConfig.agent };
      }
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #useMemory] Error loading agent for memory',
        error,
      );
    }

    const agent = await initializeAgent({
      req: this.options.req,
      res: this.options.res,
      agent: prelimAgent,
      allowedProviders,
      endpointOption: {
        endpoint:
          prelimAgent.id !== Constants.EPHEMERAL_AGENT_ID
            ? EModelEndpoint.agents
            : memoryConfig.agent?.provider,
      },
    });

    if (!agent) {
      logger.warn(
        '[api/server/controllers/agents/client.js #useMemory] No agent found for memory',
        memoryConfig,
      );
      return;
    }

    const llmConfig = Object.assign(
      {
        provider: agent.provider,
        model: agent.model,
      },
      agent.model_parameters,
    );

    /** @type {import('@librechat/api').MemoryConfig} */
    const config = {
      validKeys: memoryConfig.validKeys,
      instructions: agent.instructions,
      llmConfig,
      tokenLimit: memoryConfig.tokenLimit,
    };

    const userId = this.options.req.user.id + '';
    const messageId = this.responseMessageId + '';
    const conversationId = this.conversationId + '';
    const [withoutKeys, processMemory] = await createMemoryProcessor({
      userId,
      config,
      messageId,
      conversationId,
      memoryMethods: {
        setMemory,
        deleteMemory,
        getFormattedMemories,
      },
      res: this.options.res,
    });

    this.processMemory = processMemory;
    return withoutKeys;
  }

  /**
   * Filters out image URLs from message content
   * @param {BaseMessage} message - The message to filter
   * @returns {BaseMessage} - A new message with image URLs removed
   */
  filterImageUrls(message) {
    if (!message.content || typeof message.content === 'string') {
      return message;
    }

    if (Array.isArray(message.content)) {
      const filteredContent = message.content.filter(
        (part) => part.type !== ContentTypes.IMAGE_URL,
      );

      if (filteredContent.length === 1 && filteredContent[0].type === ContentTypes.TEXT) {
        const MessageClass = message.constructor;
        return new MessageClass({
          content: filteredContent[0].text,
          additional_kwargs: message.additional_kwargs,
        });
      }

      const MessageClass = message.constructor;
      return new MessageClass({
        content: filteredContent,
        additional_kwargs: message.additional_kwargs,
      });
    }

    return message;
  }

  /**
   * @param {BaseMessage[]} messages
   * @returns {Promise<void | (TAttachment | null)[]>}
   */
  async runMemory(messages) {
    try {
      if (this.processMemory == null) {
        return;
      }
      const appConfig = this.options.req.config;
      const memoryConfig = appConfig.memory;
      const messageWindowSize = memoryConfig?.messageWindowSize ?? 5;

      let messagesToProcess = [...messages];
      if (messages.length > messageWindowSize) {
        for (let i = messages.length - messageWindowSize; i >= 0; i--) {
          const potentialWindow = messages.slice(i, i + messageWindowSize);
          if (potentialWindow[0]?.role === 'user') {
            messagesToProcess = [...potentialWindow];
            break;
          }
        }

        if (messagesToProcess.length === messages.length) {
          messagesToProcess = [...messages.slice(-messageWindowSize)];
        }
      }

      const filteredMessages = messagesToProcess.map((msg) => this.filterImageUrls(msg));
      const bufferString = getBufferString(filteredMessages);
      const bufferMessage = new HumanMessage(`# Current Chat:\n\n${bufferString}`);
      return await this.processMemory([bufferMessage]);
    } catch (error) {
      logger.error('Memory Agent failed to process memory', error);
    }
  }

  /** @type {sendCompletion} */
  async sendCompletion(payload, opts = {}) {
    await this.chatCompletion({
      payload,
      onProgress: opts.onProgress,
      userMCPAuthMap: opts.userMCPAuthMap,
      abortController: opts.abortController,
    });
    return this.contentParts;
  }

  /**
   * @param {Object} params
   * @param {string} [params.model]
   * @param {string} [params.context='message']
   * @param {AppConfig['balance']} [params.balance]
   * @param {AppConfig['transactions']} [params.transactions]
   * @param {UsageMetadata[]} [params.collectedUsage=this.collectedUsage]
   */
  async recordCollectedUsage({
    model,
    balance,
    transactions,
    context = 'message',
    collectedUsage = this.collectedUsage,
  }) {
    if (!collectedUsage || !collectedUsage.length) {
      return;
    }
    const input_tokens =
      (collectedUsage[0]?.input_tokens || 0) +
      (Number(collectedUsage[0]?.input_token_details?.cache_creation) || 0) +
      (Number(collectedUsage[0]?.input_token_details?.cache_read) || 0);

    let output_tokens = 0;
    let previousTokens = input_tokens; // Start with original input
    for (let i = 0; i < collectedUsage.length; i++) {
      const usage = collectedUsage[i];
      if (!usage) {
        continue;
      }

      const cache_creation = Number(usage.input_token_details?.cache_creation) || 0;
      const cache_read = Number(usage.input_token_details?.cache_read) || 0;

      const txMetadata = {
        context,
        balance,
        transactions,
        conversationId: this.conversationId,
        user: this.user ?? this.options.req.user?.id,
        endpointTokenConfig: this.options.endpointTokenConfig,
        model: usage.model ?? model ?? this.model ?? this.options.agent.model_parameters.model,
      };

      if (i > 0) {
        // Count new tokens generated (input_tokens minus previous accumulated tokens)
        output_tokens +=
          (Number(usage.input_tokens) || 0) + cache_creation + cache_read - previousTokens;
      }

      // Add this message's output tokens
      output_tokens += Number(usage.output_tokens) || 0;

      // Update previousTokens to include this message's output
      previousTokens += Number(usage.output_tokens) || 0;

      if (cache_creation > 0 || cache_read > 0) {
        spendStructuredTokens(txMetadata, {
          promptTokens: {
            input: usage.input_tokens,
            write: cache_creation,
            read: cache_read,
          },
          completionTokens: usage.output_tokens,
        }).catch((err) => {
          logger.error(
            '[api/server/controllers/agents/client.js #recordCollectedUsage] Error spending structured tokens',
            err,
          );
        });
        continue;
      }
      spendTokens(txMetadata, {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
      }).catch((err) => {
        logger.error(
          '[api/server/controllers/agents/client.js #recordCollectedUsage] Error spending tokens',
          err,
        );
      });
    }

    this.usage = {
      input_tokens,
      output_tokens,
    };
  }

  /**
   * Get stream usage as returned by this client's API response.
   * @returns {UsageMetadata} The stream usage object.
   */
  getStreamUsage() {
    return this.usage;
  }

  /**
   * @param {TMessage} responseMessage
   * @returns {number}
   */
  getTokenCountForResponse({ content }) {
    return this.getTokenCountForMessage({
      role: 'assistant',
      content,
    });
  }

  /**
   * Calculates the correct token count for the current user message based on the token count map and API usage.
   * Edge case: If the calculation results in a negative value, it returns the original estimate.
   * If revisiting a conversation with a chat history entirely composed of token estimates,
   * the cumulative token count going forward should become more accurate as the conversation progresses.
   * @param {Object} params - The parameters for the calculation.
   * @param {Record<string, number>} params.tokenCountMap - A map of message IDs to their token counts.
   * @param {string} params.currentMessageId - The ID of the current message to calculate.
   * @param {OpenAIUsageMetadata} params.usage - The usage object returned by the API.
   * @returns {number} The correct token count for the current user message.
   */
  calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage }) {
    const originalEstimate = tokenCountMap[currentMessageId] || 0;

    if (!usage || typeof usage[this.inputTokensKey] !== 'number') {
      return originalEstimate;
    }

    tokenCountMap[currentMessageId] = 0;
    const totalTokensFromMap = Object.values(tokenCountMap).reduce((sum, count) => {
      const numCount = Number(count);
      return sum + (isNaN(numCount) ? 0 : numCount);
    }, 0);
    const totalInputTokens = usage[this.inputTokensKey] ?? 0;

    const currentMessageTokens = totalInputTokens - totalTokensFromMap;
    return currentMessageTokens > 0 ? currentMessageTokens : originalEstimate;
  }

  /**
   * @param {object} params
   * @param {string | ChatCompletionMessageParam[]} params.payload
   * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap]
   * @param {AbortController} [params.abortController]
   */
  async chatCompletion({ payload, userMCPAuthMap, abortController = null }) {
    /** @type {Partial<GraphRunnableConfig>} */
    let config;
    /** @type {ReturnType<createRun>} */
    let run;
    /** @type {Promise<(TAttachment | null)[] | undefined>} */
    let memoryPromise;
    try {
      if (!abortController) {
        abortController = new AbortController();
      }

      const appConfig = this.options.req.config;
      /** @type {AppConfig['endpoints']['agents']} */
      const agentsEConfig = appConfig.endpoints?.[EModelEndpoint.agents];

      config = {
        runName: 'AgentRun',
        configurable: {
          thread_id: this.conversationId,
          last_agent_index: this.agentConfigs?.size ?? 0,
          user_id: this.user ?? this.options.req.user?.id,
          hide_sequential_outputs: this.options.agent.hide_sequential_outputs,
          requestBody: {
            messageId: this.responseMessageId,
            conversationId: this.conversationId,
            parentMessageId: this.parentMessageId,
          },
          user: this.options.req.user,
        },
        recursionLimit: agentsEConfig?.recursionLimit ?? 25,
        signal: abortController.signal,
        streamMode: 'values',
        version: 'v2',
      };

      const toolSet = new Set((this.options.agent.tools ?? []).map((tool) => tool && tool.name));
      let { messages: initialMessages, indexTokenCountMap } = formatAgentMessages(
        payload,
        this.indexTokenCountMap,
        toolSet,
      );

      /**
       * @param {BaseMessage[]} messages
       */
      const runAgents = async (messages) => {
        const agents = [this.options.agent];
        if (
          this.agentConfigs &&
          this.agentConfigs.size > 0 &&
          ((this.options.agent.edges?.length ?? 0) > 0 ||
            (await checkCapability(this.options.req, AgentCapabilities.chain)))
        ) {
          agents.push(...this.agentConfigs.values());
        }

        if (agents[0].recursion_limit && typeof agents[0].recursion_limit === 'number') {
          config.recursionLimit = agents[0].recursion_limit;
        }

        if (
          agentsEConfig?.maxRecursionLimit &&
          config.recursionLimit > agentsEConfig?.maxRecursionLimit
        ) {
          config.recursionLimit = agentsEConfig?.maxRecursionLimit;
        }

        // TODO: needs to be added as part of AgentContext initialization
        // const noSystemModelRegex = [/\b(o1-preview|o1-mini|amazon\.titan-text)\b/gi];
        // const noSystemMessages = noSystemModelRegex.some((regex) =>
        //   agent.model_parameters.model.match(regex),
        // );
        // if (noSystemMessages === true && systemContent?.length) {
        //   const latestMessageContent = _messages.pop().content;
        //   if (typeof latestMessageContent !== 'string') {
        //     latestMessageContent[0].text = [systemContent, latestMessageContent[0].text].join('\n');
        //     _messages.push(new HumanMessage({ content: latestMessageContent }));
        //   } else {
        //     const text = [systemContent, latestMessageContent].join('\n');
        //     _messages.push(new HumanMessage(text));
        //   }
        // }
        // let messages = _messages;
        // if (agent.useLegacyContent === true) {
        //   messages = formatContentStrings(messages);
        // }
        // if (
        //   agent.model_parameters?.clientOptions?.defaultHeaders?.['anthropic-beta']?.includes(
        //     'prompt-caching',
        //   )
        // ) {
        //   messages = addCacheControl(messages);
        // }

        memoryPromise = this.runMemory(messages);

        run = await createRun({
          agents,
          indexTokenCountMap,
          runId: this.responseMessageId,
          signal: abortController.signal,
          customHandlers: this.options.eventHandlers,
          requestBody: config.configurable.requestBody,
          tokenCounter: createTokenCounter(this.getEncoding()),
        });

        if (!run) {
          throw new Error('Failed to create run');
        }

        this.run = run;
        if (userMCPAuthMap != null) {
          config.configurable.userMCPAuthMap = userMCPAuthMap;
        }

        /** @deprecated Agent Chain */
        config.configurable.last_agent_id = agents[agents.length - 1].id;
        await run.processStream({ messages }, config, {
          callbacks: {
            [Callback.TOOL_ERROR]: logToolError,
          },
        });

        config.signal = null;
      };

      await runAgents(initialMessages);
      /** @deprecated Agent Chain */
      if (config.configurable.hide_sequential_outputs) {
        this.contentParts = this.contentParts.filter((part, index) => {
          // Include parts that are either:
          // 1. At or after the finalContentStart index
          // 2. Of type tool_call
          // 3. Have tool_call_ids property
          return (
            index >= this.contentParts.length - 1 ||
            part.type === ContentTypes.TOOL_CALL ||
            part.tool_call_ids
          );
        });
      }

      try {
        const attachments = await this.awaitMemoryWithTimeout(memoryPromise);
        if (attachments && attachments.length > 0) {
          this.artifactPromises.push(...attachments);
        }

        const balanceConfig = getBalanceConfig(appConfig);
        const transactionsConfig = getTransactionsConfig(appConfig);
        await this.recordCollectedUsage({
          context: 'message',
          balance: balanceConfig,
          transactions: transactionsConfig,
        });
      } catch (err) {
        logger.error(
          '[api/server/controllers/agents/client.js #chatCompletion] Error recording collected usage',
          err,
        );
      }
    } catch (err) {
      const attachments = await this.awaitMemoryWithTimeout(memoryPromise);
      if (attachments && attachments.length > 0) {
        this.artifactPromises.push(...attachments);
      }
      logger.error(
        '[api/server/controllers/agents/client.js #sendCompletion] Operation aborted',
        err,
      );
      if (!abortController.signal.aborted) {
        logger.error(
          '[api/server/controllers/agents/client.js #sendCompletion] Unhandled error type',
          err,
        );
        this.contentParts.push({
          type: ContentTypes.ERROR,
          [ContentTypes.ERROR]: `An error occurred while processing the request${err?.message ? `: ${err.message}` : ''}`,
        });
      }
    }
  }


  /**
   * Generates a concise title for a conversation based on the user's input text and response.
   * Uses either specified method or starts with the OpenAI `functions` method (using LangChain).
   * If the `functions` method fails, it falls back to the `completion` method,
   * which involves sending a chat completion request with specific instructions for title generation.
   *
   * @param {Object} params - The parameters for the conversation title generation.
   * @param {string} params.text - The user's input.
   * @param {string} [params.conversationId] - The current conversationId, if not already defined on client initialization.
   * @param {string} [params.responseText=''] - The AI's immediate response to the user.
   *
   * @returns {Promise<string | 'New Chat'>} A promise that resolves to the generated conversation title.
   *                            In case of failure, it will return the default title, "New Chat".
   */
  async titleConvo({ text, conversationId, responseText = '' }) {
    this.conversationId = conversationId;

    if (this.options.attachments) {
      delete this.options.attachments;
    }

    logger.debug(`[LibreChat/api/server/controllers/agents/client.js #titleConvo] titleConvo ${text}`);

    let title = 'New Chat';
    const convo = `||>User:
"${truncateText(text)}"
||>Response:
"${JSON.stringify(truncateText(responseText))}"`;

    const { OPENAI_TITLE_MODEL } = process.env ?? {};

    let model = this.options.titleModel ?? OPENAI_TITLE_MODEL ?? 'gpt-3.5-turbo';
    if (model === Constants.CURRENT_MODEL) {
      model = this.modelOptions.model;
    }

    const modelOptions = {
      // TODO: remove the gpt fallback and make it specific to endpoint
      model,
      temperature: 0.2,
      presence_penalty: 0,
      frequency_penalty: 0,
      max_tokens: 16,
    };

    /** @type {TAzureConfig | undefined} */
    const azureConfig = this.options?.req?.app?.locals?.[EModelEndpoint.azureOpenAI];

    const resetTitleOptions = !!(
      (this.azure && azureConfig) ||
      (azureConfig && this.options.endpoint === EModelEndpoint.azureOpenAI)
    );

    if (resetTitleOptions) {
      const { modelGroupMap, groupMap } = azureConfig;
      const {
        azureOptions,
        baseURL,
        headers = {},
        serverless,
      } = mapModelToAzureConfig({
        modelName: modelOptions.model,
        modelGroupMap,
        groupMap,
      });

      this.options.headers = resolveHeaders(headers);
      this.options.reverseProxyUrl = baseURL ?? null;
      this.langchainProxy = extractBaseURL(this.options.reverseProxyUrl);
      this.apiKey = azureOptions.azureOpenAIApiKey;

      const groupName = modelGroupMap[modelOptions.model].group;
      this.options.addParams = azureConfig.groupMap[groupName].addParams;
      this.options.dropParams = azureConfig.groupMap[groupName].dropParams;
      this.options.forcePrompt = azureConfig.groupMap[groupName].forcePrompt;
      this.azure = !serverless && azureOptions;
    }

    const titleChatCompletion = async () => {
      modelOptions.model = model;

      if (this.azure) {
        modelOptions.model = process.env.AZURE_OPENAI_DEFAULT_MODEL ?? modelOptions.model;
        this.azureEndpoint = genAzureChatCompletion(this.azure, modelOptions.model, this);
      }

      const instructionsPayload = [
        {
          role: 'system',
          content: `Please generate ${titleInstruction}

${convo}

||>Title:`,
        },
      ];

      const promptTokens = this.getTokenCountForMessage(instructionsPayload[0]);

      try {
        let useChatCompletion = true;

        if (this.options.reverseProxyUrl === CohereConstants.API_URL) {
          useChatCompletion = false;
        }

        title = (
          await this.sendPayload(instructionsPayload, { modelOptions, useChatCompletion })
        ).replaceAll('"', '');

        const completionTokens = this.getTokenCount(title);

        this.recordTokenUsage({ promptTokens, completionTokens, context: 'title' });
      } catch (e) {
        logger.error(
          '[api/server/controllers/agents/client.js #titleConvo] There was an issue generating the title with the completion method',
          e,
        );
      }
    };

    if (this.options.titleMethod === 'completion') {
      await titleChatCompletion();
      logger.debug('[api/server/controllers/agents/client.js #titleConvo] Convo Title: ' + title);
      return title;
    }

    try {
      logger.info(
        '[api/server/controllers/agents/client.js #titleConvo] before this.initializeLLM',
        e,
      );

      this.abortController = new AbortController();
      const llm = this.initializeLLM({
        ...modelOptions,
        conversationId,
        context: 'title',
        tokenBuffer: 150,
      });

      logger.info(
        '[api/server/controllers/agents/client.js #titleConvo] after this.initializeLLM',
        e,
      );

      title = await runTitleChain({ llm, text, convo, signal: this.abortController.signal });
    } catch (e) {
      if (e?.message?.toLowerCase()?.includes('abort')) {
        logger.debug('[api/server/controllers/agents/client.js #titleConvo] Aborted title generation');
        return;
      }
      logger.error(
        '[api/server/controllers/agents/client.js #titleConvo] There was an issue generating title with LangChain, trying completion method...',
        e,
      );

      await titleChatCompletion();
    }

    logger.debug('[api/server/controllers/agents/client.js #titleConvo] Convo Title: ' + title);
    return title;
  }


  /**
   * @param {object} params
   * @param {number} params.promptTokens
   * @param {number} params.completionTokens
   * @param {string} [params.model]
   * @param {OpenAIUsageMetadata} [params.usage]
   * @param {AppConfig['balance']} [params.balance]
   * @param {string} [params.context='message']
   * @returns {Promise<void>}
   */
  async recordTokenUsage({
    model,
    usage,
    balance,
    promptTokens,
    completionTokens,
    context = 'message',
  }) {
    try {
      await spendTokens(
        {
          model,
          context,
          balance,
          conversationId: this.conversationId,
          user: this.user ?? this.options.req.user?.id,
          endpointTokenConfig: this.options.endpointTokenConfig,
        },
        { promptTokens, completionTokens },
      );

      if (
        usage &&
        typeof usage === 'object' &&
        'reasoning_tokens' in usage &&
        typeof usage.reasoning_tokens === 'number'
      ) {
        await spendTokens(
          {
            model,
            balance,
            context: 'reasoning',
            conversationId: this.conversationId,
            user: this.user ?? this.options.req.user?.id,
            endpointTokenConfig: this.options.endpointTokenConfig,
          },
          { completionTokens: usage.reasoning_tokens },
        );
      }
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #recordTokenUsage] Error recording token usage',
        error,
      );
    }
  }

  getEncoding() {
    return 'o200k_base';
  }

  /**
   * Returns the token count of a given text. It also checks and resets the tokenizers if necessary.
   * @param {string} text - The text to get the token count for.
   * @returns {number} The token count of the given text.
   */
  getTokenCount(text) {
    const encoding = this.getEncoding();
    return Tokenizer.getTokenCount(text, encoding);
  }
}

module.exports = AgentClient;
