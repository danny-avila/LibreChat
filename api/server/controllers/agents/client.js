require('events').EventEmitter.defaultMaxListeners = 100;
const { logger } = require('@librechat/data-schemas');
const { getBufferString, HumanMessage } = require('@langchain/core/messages');
const {
  createRun,
  Tokenizer,
  checkAccess,
  buildToolSet,
  sanitizeTitle,
  logToolError,
  payloadParser,
  resolveHeaders,
  createSafeUser,
  initializeAgent,
  getBalanceConfig,
  getProviderConfig,
  omitTitleOptions,
  memoryInstructions,
  applyContextToAgent,
  createTokenCounter,
  GenerationJobManager,
  getTransactionsConfig,
  createMemoryProcessor,
  createMultiAgentMapper,
  filterMalformedContentParts,
} = require('@librechat/api');
const {
  Callback,
  Providers,
  TitleMethod,
  formatMessage,
  formatAgentMessages,
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
  isEphemeralAgentId,
  removeNullishValues,
} = require('librechat-data-provider');
const { spendTokens, spendStructuredTokens } = require('~/models/spendTokens');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { createContextHandlers } = require('~/app/clients/prompts');
const { getConvoFiles } = require('~/models/Conversation');
const BaseClient = require('~/app/clients/BaseClient');
const { getRoleByName } = require('~/models/Role');
const { loadAgent } = require('~/models/Agent');
const { getMCPManager } = require('~/config');
const db = require('~/models');

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

  setOptions(_options) {}

  /**
   * `AgentClient` is not opinionated about vision requests, so we don't do anything here
   * @param {MongoFile[]} attachments
   */
  checkVisionRequest() {}

  getSaveOptions() {
    let runOptions = {};
    try {
      runOptions = payloadParser(this.options) ?? {};
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #getSaveOptions] Error parsing options',
        error,
      );
    }

    return removeNullishValues(
      Object.assign(
        {
          spec: this.options.spec,
          iconURL: this.options.iconURL,
          endpoint: this.options.endpoint,
          agent_id: this.options.agent.id,
          modelLabel: this.options.modelLabel,
          resendFiles: this.options.resendFiles,
          imageDetail: this.options.imageDetail,
          maxContextTokens: this.maxContextTokens,
        },
        // TODO: PARSE OPTIONS BY PROVIDER, MAY CONTAIN SENSITIVE DATA
        runOptions,
      ),
    );
  }

  /**
   * Returns build message options. For AgentClient, agent-specific instructions
   * are retrieved directly from agent objects in buildMessages, so this returns empty.
   * @returns {Object} Empty options object
   */
  getBuildMessagesOptions() {
    return {};
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
      {
        provider: this.options.agent.provider,
        endpoint: this.options.endpoint,
      },
      VisionModes.agents,
    );
    message.image_urls = image_urls.length ? image_urls : undefined;
    return files;
  }

  async buildMessages(messages, parentMessageId, _buildOptions, opts) {
    /** Always pass mapMethod; getMessagesForConversation applies it only to messages with addedConvo flag */
    const orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
      summary: this.shouldSummarize,
      mapMethod: createMultiAgentMapper(this.options.agent, this.agentConfigs),
      mapCondition: (message) => message.addedConvo === true,
    });

    let payload;
    /** @type {number | undefined} */
    let promptTokens;

    /**
     * Extract base instructions for all agents (combines instructions + additional_instructions).
     * This must be done before applying context to preserve the original agent configuration.
     */
    const extractBaseInstructions = (agent) => {
      const baseInstructions = [agent.instructions ?? '', agent.additional_instructions ?? '']
        .filter(Boolean)
        .join('\n')
        .trim();
      agent.instructions = baseInstructions;
      return agent;
    };

    /** Collect all agents for unified processing, extracting base instructions during collection */
    const allAgents = [
      { agent: extractBaseInstructions(this.options.agent), agentId: this.options.agent.id },
      ...(this.agentConfigs?.size > 0
        ? Array.from(this.agentConfigs.entries()).map(([agentId, agent]) => ({
            agent: extractBaseInstructions(agent),
            agentId,
          }))
        : []),
    ];

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

      /** For non-latest messages, prepend file context directly to message content */
      if (message.fileContext && i !== orderedMessages.length - 1) {
        if (typeof formattedMessage.content === 'string') {
          formattedMessage.content = message.fileContext + '\n' + formattedMessage.content;
        } else {
          const textPart = formattedMessage.content.find((part) => part.type === 'text');
          textPart
            ? (textPart.text = message.fileContext + '\n' + textPart.text)
            : formattedMessage.content.unshift({ type: 'text', text: message.fileContext });
        }
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

    /**
     * Build shared run context - applies to ALL agents in the run.
     * This includes: file context (latest message), augmented prompt (RAG), memory context.
     */
    const sharedRunContextParts = [];

    /** File context from the latest message (attachments) */
    const latestMessage = orderedMessages[orderedMessages.length - 1];
    if (latestMessage?.fileContext) {
      sharedRunContextParts.push(latestMessage.fileContext);
    }

    /** Augmented prompt from RAG/context handlers */
    if (this.contextHandlers) {
      this.augmentedPrompt = await this.contextHandlers.createContext();
      if (this.augmentedPrompt) {
        sharedRunContextParts.push(this.augmentedPrompt);
      }
    }

    /** Memory context (user preferences/memories) */
    const memoryXml = await this.useMemory();
    if (memoryXml) {
      const memoryContext = `${memoryInstructions}\n\n${memoryXml}`;
      sharedRunContextParts.push(memoryContext);
    }

    const sharedRunContext = sharedRunContextParts.join('\n\n');

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

    /**
     * Apply context to all agents.
     * Each agent gets: shared run context + their own base instructions + their own MCP instructions.
     *
     * NOTE: This intentionally mutates agent objects in place. The agentConfigs Map
     * holds references to config objects that will be passed to the graph runtime.
     */
    const ephemeralAgent = this.options.req.body.ephemeralAgent;
    const mcpManager = getMCPManager();
    await Promise.all(
      allAgents.map(({ agent, agentId }) =>
        applyContextToAgent({
          agent,
          agentId,
          logger,
          mcpManager,
          sharedRunContext,
          ephemeralAgent: agentId === this.options.agent.id ? ephemeralAgent : undefined,
        }),
      ),
    );

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
   * Formats scoped memory documents as XML for injection into conversation context.
   * @param {{ globalContent: string, projectContent: string, projectName: string }} scopedMemories
   * @returns {string}
   */
  formatMemoryDocumentsXml(scopedMemories) {
    const { globalContent, projectContent, projectName } = scopedMemories;
    const parts = ['<userMemories>'];

    if (globalContent) {
      parts.push('<globalMemories>');
      parts.push(globalContent);
      parts.push('</globalMemories>');
    }

    if (projectContent && projectName) {
      parts.push(`<projectMemories project="${projectName}">`);
      parts.push(projectContent);
      parts.push('</projectMemories>');
    }

    parts.push('</userMemories>');
    return parts.join('\n');
  }

  /**
   * Resolves the projectId for the current conversation.
   * @returns {Promise<string | null>}
   */
  async getConversationProjectId() {
    try {
      const conversationId = this.conversationId + '';
      const userId = this.options.req.user.id + '';
      const convo = await db.getConvo(userId, conversationId);
      return convo?.projectId?.toString() || null;
    } catch (error) {
      logger.debug('[AgentClient] Could not resolve conversation projectId:', error);
      return null;
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

    const userId = this.options.req.user.id + '';
    let memoryXml;

    try {
      const projectId = await this.getConversationProjectId();
      const scopedMemories = await db.getMemoryDocuments({ userId, projectId });
      if (scopedMemories.globalContent || scopedMemories.projectContent) {
        memoryXml = this.formatMemoryDocumentsXml(scopedMemories);
      }
    } catch (error) {
      logger.error('[AgentClient] Error loading memory documents:', error);
    }

    const appConfig = this.options.req.config;
    const memoryConfig = appConfig.memory;
    if (memoryConfig && memoryConfig.disabled !== true) {
      await this.setupMemoryAgent(memoryConfig, appConfig);
    }

    return memoryXml;
  }

  /**
   * Sets up the memory agent for explicit "remember this" processing.
   * @param {object} memoryConfig
   * @param {object} appConfig
   * @returns {Promise<void>}
   */
  async setupMemoryAgent(memoryConfig, appConfig) {
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
      } else if (memoryConfig.agent?.id != null) {
        prelimAgent = this.options.agent;
      } else if (
        memoryConfig.agent?.id == null &&
        memoryConfig.agent?.model != null &&
        memoryConfig.agent?.provider != null
      ) {
        prelimAgent = { id: Constants.EPHEMERAL_AGENT_ID, ...memoryConfig.agent };
      }
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #setupMemoryAgent] Error loading agent for memory',
        error,
      );
    }

    if (!prelimAgent) {
      return;
    }

    const agent = await initializeAgent(
      {
        req: this.options.req,
        res: this.options.res,
        agent: prelimAgent,
        allowedProviders,
        endpointOption: {
          endpoint: !isEphemeralAgentId(prelimAgent.id)
            ? EModelEndpoint.agents
            : memoryConfig.agent?.provider,
        },
      },
      {
        getConvoFiles,
        getFiles: db.getFiles,
        getUserKey: db.getUserKey,
        updateFilesUsage: db.updateFilesUsage,
        getUserKeyValues: db.getUserKeyValues,
        getToolFilesByIds: db.getToolFilesByIds,
        getCodeGeneratedFiles: db.getCodeGeneratedFiles,
      },
    );

    if (!agent) {
      logger.warn(
        '[api/server/controllers/agents/client.js #setupMemoryAgent] No agent found for memory',
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
    const streamId = this.options.req?._resumableStreamId || null;
    const [, processMemory] = await createMemoryProcessor({
      userId,
      config,
      messageId,
      streamId,
      conversationId,
      memoryMethods: {
        setMemory: db.setMemory,
        deleteMemory: db.deleteMemory,
        getFormattedMemories: db.getFormattedMemories,
      },
      res: this.options.res,
      user: createSafeUser(this.options.req.user),
    });

    this.processMemory = processMemory;
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

    const completion = filterMalformedContentParts(this.contentParts);
    return { completion };
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
    // Use first entry's input_tokens as the base input (represents initial user message context)
    // Support both OpenAI format (input_token_details) and Anthropic format (cache_*_input_tokens)
    const firstUsage = collectedUsage[0];
    const input_tokens =
      (firstUsage?.input_tokens || 0) +
      (Number(firstUsage?.input_token_details?.cache_creation) ||
        Number(firstUsage?.cache_creation_input_tokens) ||
        0) +
      (Number(firstUsage?.input_token_details?.cache_read) ||
        Number(firstUsage?.cache_read_input_tokens) ||
        0);

    // Sum output_tokens directly from all entries - works for both sequential and parallel execution
    // This avoids the incremental calculation that produced negative values for parallel agents
    let total_output_tokens = 0;

    for (const usage of collectedUsage) {
      if (!usage) {
        continue;
      }

      // Support both OpenAI format (input_token_details) and Anthropic format (cache_*_input_tokens)
      const cache_creation =
        Number(usage.input_token_details?.cache_creation) ||
        Number(usage.cache_creation_input_tokens) ||
        0;
      const cache_read =
        Number(usage.input_token_details?.cache_read) || Number(usage.cache_read_input_tokens) || 0;

      // Accumulate output tokens for the usage summary
      total_output_tokens += Number(usage.output_tokens) || 0;

      const txMetadata = {
        context,
        balance,
        transactions,
        conversationId: this.conversationId,
        user: this.user ?? this.options.req.user?.id,
        endpointTokenConfig: this.options.endpointTokenConfig,
        model: usage.model ?? model ?? this.model ?? this.options.agent.model_parameters.model,
      };

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
      output_tokens: total_output_tokens,
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
    const appConfig = this.options.req.config;
    const balanceConfig = getBalanceConfig(appConfig);
    const transactionsConfig = getTransactionsConfig(appConfig);
    try {
      if (!abortController) {
        abortController = new AbortController();
      }

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
          user: createSafeUser(this.options.req.user),
        },
        recursionLimit: agentsEConfig?.recursionLimit ?? 50,
        signal: abortController.signal,
        streamMode: 'values',
        version: 'v2',
      };

      const toolSet = buildToolSet(this.options.agent);
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
        // Include additional agents when:
        // - agentConfigs has agents (from addedConvo parallel execution or agent handoffs)
        // - Agents without incoming edges become start nodes and run in parallel automatically
        if (this.agentConfigs && this.agentConfigs.size > 0) {
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
          messages,
          indexTokenCountMap,
          runId: this.responseMessageId,
          signal: abortController.signal,
          customHandlers: this.options.eventHandlers,
          requestBody: config.configurable.requestBody,
          user: createSafeUser(this.options.req?.user),
          tokenCounter: createTokenCounter(this.getEncoding()),
        });

        if (!run) {
          throw new Error('Failed to create run');
        }

        this.run = run;

        const streamId = this.options.req?._resumableStreamId;
        if (streamId && run.Graph) {
          GenerationJobManager.setGraph(streamId, run.Graph);
        }

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
    } catch (err) {
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
    } finally {
      try {
        const attachments = await this.awaitMemoryWithTimeout(memoryPromise);
        if (attachments && attachments.length > 0) {
          this.artifactPromises.push(...attachments);
        }

        /** Skip token spending if aborted - the abort handler (abortMiddleware.js) handles it
        This prevents double-spending when user aborts via `/api/agents/chat/abort` */
        const wasAborted = abortController?.signal?.aborted;
        if (!wasAborted) {
          await this.recordCollectedUsage({
            context: 'message',
            balance: balanceConfig,
            transactions: transactionsConfig,
          });
        } else {
          logger.debug(
            '[api/server/controllers/agents/client.js #chatCompletion] Skipping token spending - handled by abort middleware',
          );
        }
      } catch (err) {
        logger.error(
          '[api/server/controllers/agents/client.js #chatCompletion] Error in cleanup phase',
          err,
        );
      }
      run = null;
      config = null;
      memoryPromise = null;
    }
  }

  /**
   *
   * @param {Object} params
   * @param {string} params.text
   * @param {string} params.conversationId
   */
  async titleConvo({ text, abortController }) {
    if (!this.run) {
      throw new Error('Run not initialized');
    }
    const { handleLLMEnd, collected: collectedMetadata } = createMetadataAggregator();
    const { req, agent } = this.options;

    if (req?.body?.isTemporary) {
      logger.debug(
        `[api/server/controllers/agents/client.js #titleConvo] Skipping title generation for temporary conversation`,
      );
      return;
    }

    const appConfig = req.config;
    let endpoint = agent.endpoint;

    /** @type {import('@librechat/agents').ClientOptions} */
    let clientOptions = {
      model: agent.model || agent.model_parameters.model,
    };

    let titleProviderConfig = getProviderConfig({ provider: endpoint, appConfig });

    /** @type {TEndpoint | undefined} */
    const endpointConfig =
      appConfig.endpoints?.all ??
      appConfig.endpoints?.[endpoint] ??
      titleProviderConfig.customEndpointConfig;
    if (!endpointConfig) {
      logger.debug(
        `[api/server/controllers/agents/client.js #titleConvo] No endpoint config for "${endpoint}"`,
      );
    }

    if (endpointConfig?.titleConvo === false) {
      logger.debug(
        `[api/server/controllers/agents/client.js #titleConvo] Title generation disabled for endpoint "${endpoint}"`,
      );
      return;
    }

    if (endpointConfig?.titleEndpoint && endpointConfig.titleEndpoint !== endpoint) {
      try {
        titleProviderConfig = getProviderConfig({
          provider: endpointConfig.titleEndpoint,
          appConfig,
        });
        endpoint = endpointConfig.titleEndpoint;
      } catch (error) {
        logger.warn(
          `[api/server/controllers/agents/client.js #titleConvo] Error getting title endpoint config for "${endpointConfig.titleEndpoint}", falling back to default`,
          error,
        );
        // Fall back to original provider config
        endpoint = agent.endpoint;
        titleProviderConfig = getProviderConfig({ provider: endpoint, appConfig });
      }
    }

    if (
      endpointConfig &&
      endpointConfig.titleModel &&
      endpointConfig.titleModel !== Constants.CURRENT_MODEL
    ) {
      clientOptions.model = endpointConfig.titleModel;
    }

    const options = await titleProviderConfig.getOptions({
      req,
      endpoint,
      model_parameters: clientOptions,
      db: {
        getUserKey: db.getUserKey,
        getUserKeyValues: db.getUserKeyValues,
      },
    });

    let provider = options.provider ?? titleProviderConfig.overrideProvider ?? agent.provider;
    if (
      endpoint === EModelEndpoint.azureOpenAI &&
      options.llmConfig?.azureOpenAIApiInstanceName == null
    ) {
      provider = Providers.OPENAI;
    } else if (
      endpoint === EModelEndpoint.azureOpenAI &&
      options.llmConfig?.azureOpenAIApiInstanceName != null &&
      provider !== Providers.AZURE
    ) {
      provider = Providers.AZURE;
    }

    /** @type {import('@librechat/agents').ClientOptions} */
    clientOptions = { ...options.llmConfig };
    if (options.configOptions) {
      clientOptions.configuration = options.configOptions;
    }

    if (clientOptions.maxTokens != null) {
      delete clientOptions.maxTokens;
    }
    if (clientOptions?.modelKwargs?.max_completion_tokens != null) {
      delete clientOptions.modelKwargs.max_completion_tokens;
    }
    if (clientOptions?.modelKwargs?.max_output_tokens != null) {
      delete clientOptions.modelKwargs.max_output_tokens;
    }

    clientOptions = Object.assign(
      Object.fromEntries(
        Object.entries(clientOptions).filter(([key]) => !omitTitleOptions.has(key)),
      ),
    );

    if (
      provider === Providers.GOOGLE &&
      (endpointConfig?.titleMethod === TitleMethod.FUNCTIONS ||
        endpointConfig?.titleMethod === TitleMethod.STRUCTURED)
    ) {
      clientOptions.json = true;
    }

    /** Resolve request-based headers for Custom Endpoints. Note: if this is added to
     *  non-custom endpoints, needs consideration of varying provider header configs.
     */
    if (clientOptions?.configuration?.defaultHeaders != null) {
      clientOptions.configuration.defaultHeaders = resolveHeaders({
        headers: clientOptions.configuration.defaultHeaders,
        user: createSafeUser(this.options.req?.user),
        body: {
          messageId: this.responseMessageId,
          conversationId: this.conversationId,
          parentMessageId: this.parentMessageId,
        },
      });
    }

    try {
      const titleResult = await this.run.generateTitle({
        provider,
        clientOptions,
        inputText: text,
        contentParts: this.contentParts,
        titleMethod: endpointConfig?.titleMethod,
        titlePrompt: endpointConfig?.titlePrompt,
        titlePromptTemplate: endpointConfig?.titlePromptTemplate,
        chainOptions: {
          signal: abortController.signal,
          callbacks: [
            {
              handleLLMEnd,
            },
          ],
          configurable: {
            thread_id: this.conversationId,
            user_id: this.user ?? this.options.req.user?.id,
          },
        },
      });

      const collectedUsage = collectedMetadata.map((item) => {
        let input_tokens, output_tokens;

        if (item.usage) {
          input_tokens =
            item.usage.prompt_tokens || item.usage.input_tokens || item.usage.inputTokens;
          output_tokens =
            item.usage.completion_tokens || item.usage.output_tokens || item.usage.outputTokens;
        } else if (item.tokenUsage) {
          input_tokens = item.tokenUsage.promptTokens;
          output_tokens = item.tokenUsage.completionTokens;
        }

        return {
          input_tokens: input_tokens,
          output_tokens: output_tokens,
        };
      });

      const balanceConfig = getBalanceConfig(appConfig);
      const transactionsConfig = getTransactionsConfig(appConfig);
      await this.recordCollectedUsage({
        collectedUsage,
        context: 'title',
        model: clientOptions.model,
        balance: balanceConfig,
        transactions: transactionsConfig,
      }).catch((err) => {
        logger.error(
          '[api/server/controllers/agents/client.js #titleConvo] Error recording collected usage',
          err,
        );
      });

      return sanitizeTitle(titleResult.title);
    } catch (err) {
      logger.error('[api/server/controllers/agents/client.js #titleConvo] Error', err);
      return;
    }
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
