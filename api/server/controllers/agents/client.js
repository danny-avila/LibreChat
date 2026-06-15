require('events').EventEmitter.defaultMaxListeners = 100;
const { logger } = require('@librechat/data-schemas');
const { getBufferString, HumanMessage } = require('@librechat/agents/langchain/messages');
const {
  createRun,
  isEnabled,
  checkAccess,
  buildToolSet,
  logToolError,
  sanitizeTitle,
  payloadParser,
  createSafeUser,
  initializeAgent,
  resolveConfigHeaders,
  countTokens,
  getBalanceConfig,
  omitTitleOptions,
  getProviderConfig,
  memoryInstructions,
  createTokenCounter,
  applyContextToAgent,
  isMemoryAgentEnabled,
  recordCollectedUsage,
  sendEvent,
  computeUsageCostUSD,
  aggregateEmittedUsage,
  resolveAgentTokenConfig,
  buildPersistedContextUsage,
  computeSummaryUsedTokens,
  priorRunOutputTokens,
  createSubagentUsageSink,
  isDeepSeekReasoningProvider,
  GenerationJobManager,
  getTransactionsConfig,
  resolveRecursionLimit,
  createMemoryProcessor,
  loadAgent: loadAgentFn,
  createMultiAgentMapper,
  filterMalformedContentParts,
  countFormattedMessageTokens,
  prependFileContext,
  hydrateMissingIndexTokenCounts,
  injectSkillPrimes,
  collectFreshSkillPrimeNames,
  isSkillPrimeMessage,
  collectFileIds,
  processTextWithTokenLimit,
  buildAgentScopedContext,
  buildSkillPrimeContentParts,
  buildInitialToolSessions,
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
  UsageEvents,
  Permissions,
  VisionModes,
  ContentTypes,
  EModelEndpoint,
  PermissionTypes,
  AgentCapabilities,
  isAgentsEndpoint,
  isEphemeralAgentId,
  removeNullishValues,
  DEFAULT_MEMORY_MAX_INPUT_TOKENS,
} = require('librechat-data-provider');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { createContextHandlers } = require('~/app/clients/prompts');
const { resolveConfigServers } = require('~/server/services/MCP');
const { getMCPServerTools } = require('~/server/services/Config');
const BaseClient = require('~/app/clients/BaseClient');
const { getMCPManager } = require('~/config');
const db = require('~/models');

const loadAgent = (params) => loadAgentFn(params, { getAgent: db.getAgent, getMCPServerTools });

const MEMORY_INPUT_CHARS_PER_TOKEN = 8;

class AgentClient extends BaseClient {
  constructor(options = {}) {
    super(null, options);
    /** The current client class
     * @type {string} */
    this.clientName = EModelEndpoint.agents;

    /** @deprecated @type {true} - Is a Chat Completion Request */
    this.isChatCompletion = true;

    /** @type {AgentRun} */
    this.run;

    /** Resolves with the agent run once `chatCompletion` initializes it (or
     *  `null` if initialization fails), letting immediate-mode title generation
     *  await the run instead of throwing when fired before the run exists.
     *  @type {Promise<AgentRun | null> | null} */
    this._runReady = null;
    /** @type {((run: AgentRun | null) => void) | null} */
    this._resolveRun = null;

    const {
      agentConfigs,
      contentParts,
      collectedUsage,
      collectedThoughtSignatures,
      artifactPromises,
      maxContextTokens,
      subagentAggregatorsByToolCallId,
      contextUsageSink,
      usageEmitSink,
      ...clientOptions
    } = options;

    this.agentConfigs = agentConfigs;
    this.maxContextTokens = maxContextTokens;
    /** Latest visible context snapshot for this response, captured live by the
     *  ON_CONTEXT_USAGE handler; persisted on `metadata.contextUsage`.
     *  @type {{ latest: import('librechat-data-provider').TContextUsageEvent | null } | undefined} */
    this.contextUsageSink = contextUsageSink;
    /** Every emitted `on_token_usage` payload for this response (primary,
     *  summarization, sequential, and subagent); aggregated into the rollup
     *  persisted on `metadata.usage`.
     *  @type {Array<import('librechat-data-provider').TTokenUsageEvent> | undefined} */
    this.usageEmitSink = usageEmitSink;
    /** @type {MessageContentComplex[]} */
    this.contentParts = contentParts;
    /** @type {Array<UsageMetadata>} */
    this.collectedUsage = collectedUsage;
    /** Vertex Gemini 3 thought signatures captured during the run, keyed by
     *  `tool_call_id`. Persisted on `responseMessage.metadata.thoughtSignatures`
     *  and restored as `additional_kwargs.signatures` on subsequent turns to
     *  keep tool round-trips valid across DB reconstruction.
     *  @type {Record<string, string> | undefined} */
    this.collectedThoughtSignatures = collectedThoughtSignatures;
    /** @type {ArtifactPromises} */
    this.artifactPromises = artifactPromises;
    /** Per-request map of `createContentAggregator` instances keyed by
     *  the parent's `tool_call_id`. `ON_SUBAGENT_UPDATE` events stream
     *  into each aggregator as they arrive; `finalizeSubagentContent`
     *  harvests `contentParts` onto the matching `subagent` tool_call
     *  so the child's full activity survives a page refresh. */
    this.subagentAggregatorsByToolCallId = subagentAggregatorsByToolCallId ?? new Map();
    /** In-flight `on_token_usage` emits from subagent child runs. The sink
     *  fires the emitter without awaiting, so chatCompletion's finally flushes
     *  these before returning — otherwise job cleanup can race the persist.
     *  @type {Promise<void>[]} */
    this.pendingSubagentEmits = [];
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
    /** @type {Array<Record<string, unknown>> | null} */
    this.memoryPayload = null;
    /** @type {(messages: BaseMessage[]) => Promise<void>} */
    this.processMemory;
  }

  /**
   * Returns the aggregated content parts for the current run.
   * @returns {MessageContentComplex[]} */
  getContentParts() {
    return this.contentParts;
  }

  /**
   * Harvest the `contentParts` from each per-subagent `createContentAggregator`
   * instance and attach them onto the matching parent `subagent` tool_call
   * as `subagent_content`. Runs once per message save (from
   * `sendCompletion`'s `finally`) so the child's full reasoning / tool
   * calls / final text survive a page refresh — the client-side Recoil
   * atom is session-only. Aggregators keyed by a tool_call_id that never
   * appeared in `contentParts` are discarded (no home to attach to).
   */
  finalizeSubagentContent() {
    const buffer = this.subagentAggregatorsByToolCallId;
    if (!buffer || buffer.size === 0 || !Array.isArray(this.contentParts)) {
      return;
    }
    for (const part of this.contentParts) {
      if (part?.type !== ContentTypes.TOOL_CALL) continue;
      const toolCall = part[ContentTypes.TOOL_CALL];
      if (!toolCall || toolCall.name !== Constants.SUBAGENT || !toolCall.id) continue;
      const aggregator = buffer.get(toolCall.id);
      if (!aggregator) continue;
      try {
        /** `createContentAggregator` returns a sparse array (undefined
         *  slots for indices that never received content). Strip those
         *  so the persisted shape is a clean `TMessageContentParts[]`. */
        const parts = Array.isArray(aggregator.contentParts)
          ? aggregator.contentParts.filter((p) => p != null)
          : [];
        if (parts.length > 0) {
          toolCall.subagent_content = parts;
        }
      } catch (err) {
        logger.warn(
          `[AgentClient] Failed to attach subagent content for tool_call ${toolCall.id}: ${err?.message ?? err}`,
        );
      }
    }
    buffer.clear();
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
          chatProjectId: this.options.chatProjectId,
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

    /** Normalize instruction fields before applying per-run context. */
    const normalizeInstructions = (agent) => {
      agent.instructions = agent.instructions?.trim() || undefined;
      agent.additional_instructions = agent.additional_instructions?.trim() || undefined;
      return agent;
    };

    /** Collect all agents for unified processing while preserving stable/dynamic instruction fields. */
    const allAgents = [
      { agent: normalizeInstructions(this.options.agent), agentId: this.options.agent.id },
      ...(this.agentConfigs?.size > 0
        ? Array.from(this.agentConfigs.entries()).map(([agentId, agent]) => ({
            agent: normalizeInstructions(agent),
            agentId,
          }))
        : []),
    ];
    const sharedRunAttachmentIds = new Set();
    if (this.options.attachments) {
      const attachments = await this.options.attachments;
      const latestMessage = orderedMessages[orderedMessages.length - 1];

      for (const fileId of collectFileIds(attachments)) {
        sharedRunAttachmentIds.add(fileId);
      }

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

    /** @type {Record<number, number>} */
    const indexTokenCountMap = {};
    /** @type {Record<string, number>} */
    const tokenCountMap = {};
    const memoryPayload = [];
    let hasFileContext = false;
    let promptTokenTotal = 0;
    const encoding = this.getEncoding();
    const formattedMessages = orderedMessages.map((message, i) => {
      const formattedMessage = formatMessage({
        message,
        userName: this.options?.name,
        assistantName: this.options?.modelLabel,
      });
      const memoryFormattedMessage = formatMessage({
        message,
        userName: this.options?.name,
        assistantName: this.options?.modelLabel,
      });

      /**
       * Bind file context to the message it belongs to. Historical attachments
       * are resent inline, so the current turn's text attachment must be inline
       * too instead of living only in the dynamic system tail.
       */
      if (message.fileContext) {
        hasFileContext = true;
        prependFileContext(formattedMessage, message.fileContext);
      }

      memoryPayload.push(memoryFormattedMessage);

      const dbTokenCount = Number(orderedMessages[i].tokenCount);
      const hasDbTokenCount = Number.isFinite(dbTokenCount) && dbTokenCount > 0;
      const needsCanonicalTokenCount =
        !hasDbTokenCount || (this.isVisionModel && (message.image_urls || message.files));

      let canonicalTokenCount = hasDbTokenCount ? dbTokenCount : 0;
      if (needsCanonicalTokenCount) {
        canonicalTokenCount = countFormattedMessageTokens(memoryFormattedMessage, encoding);
      }

      const promptMessageTokenCount = message.fileContext
        ? countFormattedMessageTokens(formattedMessage, encoding)
        : canonicalTokenCount;

      /* If message has files, calculate image token cost */
      if (this.message_file_map && this.message_file_map[message.messageId]) {
        const attachments = this.message_file_map[message.messageId];
        for (const file of attachments) {
          if (file.embedded) {
            this.contextHandlers?.processFile(file);
            continue;
          }
          if (file.metadata?.codeEnvRef) {
            continue;
          }
        }
      }

      const normalizedCanonicalTokenCount =
        Number.isFinite(canonicalTokenCount) && canonicalTokenCount > 0 ? canonicalTokenCount : 0;
      const normalizedPromptTokenCount =
        Number.isFinite(promptMessageTokenCount) && promptMessageTokenCount > 0
          ? promptMessageTokenCount
          : 0;

      orderedMessages[i].tokenCount = normalizedCanonicalTokenCount;
      indexTokenCountMap[i] = normalizedPromptTokenCount;
      promptTokenTotal += normalizedPromptTokenCount;

      if (message.messageId) {
        tokenCountMap[message.messageId] = normalizedCanonicalTokenCount;
      }

      if (isEnabled(process.env.AGENT_DEBUG_LOGGING)) {
        const role = message.isCreatedByUser ? 'user' : 'assistant';
        const hasSummary =
          Array.isArray(message.content) && message.content.some((p) => p && p.type === 'summary');
        const suffix = hasSummary ? '[S]' : '';
        const id = (message.messageId ?? message.id ?? '').slice(-8);
        const recalced = needsCanonicalTokenCount ? normalizedCanonicalTokenCount : null;
        const promptRecalced = message.fileContext ? normalizedPromptTokenCount : null;
        logger.debug(
          `[AgentClient] msg[${i}] ${role}${suffix} id=…${id} db=${dbTokenCount} needsRecount=${needsCanonicalTokenCount} recalced=${recalced} promptRecalced=${promptRecalced} tokens=${normalizedPromptTokenCount}`,
        );
      }

      return formattedMessage;
    });

    payload = formattedMessages;
    this.memoryPayload = hasFileContext ? memoryPayload : null;
    messages = orderedMessages;
    promptTokens = promptTokenTotal;

    /**
     * Build shared run context - applies to ALL agents in the run.
     * Request attachment file context is already bound inline to the latest
     * user message above; only side-channel context belongs here.
     * Memory context is handled separately and applied per-agent based on config.
     */
    const sharedRunContextParts = [];

    /** Augmented prompt from RAG/context handlers */
    if (this.contextHandlers) {
      this.augmentedPrompt = await this.contextHandlers.createContext();
      if (this.augmentedPrompt) {
        sharedRunContextParts.push(this.augmentedPrompt);
      }
    }

    /** Memory context (user preferences/memories) */
    const withoutKeys = await this.useMemory();
    const memoryContext = withoutKeys
      ? `${memoryInstructions}\n\n# Existing memory about the user:\n${withoutKeys}`
      : undefined;

    const sharedRunContext = sharedRunContextParts.join('\n\n');
    const memoryAgentEnabled = isMemoryAgentEnabled(this.options.req.config?.memory);

    const agentScopedContext = await buildAgentScopedContext({
      agentIds: allAgents.map(({ agentId }) => agentId),
      attachmentsByAgentId: this.options.agentContextAttachmentsByAgentId,
      sharedRunAttachmentIds,
      req: this.options.req,
      tokenCountFn: (text) => countTokens(text),
    });

    /** Preserve prompt token counts for graph formatting and pruning. */
    this.indexTokenCountMap = indexTokenCountMap;

    /** Extract contextMeta from the parent response (second-to-last in ordered chain;
     *  last is the current user message). Seeds the pruner's calibration EMA for this run. */
    const parentResponse =
      orderedMessages.length >= 2 ? orderedMessages[orderedMessages.length - 2] : undefined;
    if (parentResponse?.contextMeta && !parentResponse.isCreatedByUser) {
      this.contextMeta = parentResponse.contextMeta;
    }

    const result = {
      prompt: payload,
      tokenCountMap,
      promptTokens,
      messages,
    };

    if (promptTokens >= 0 && typeof opts?.getReqData === 'function') {
      opts.getReqData({ promptTokens });
    }

    /**
     * Apply context to all agents.
     * Stable agent/MCP instructions stay on `instructions`; shared runtime context
     * is appended to `additional_instructions` as the dynamic system tail.
     *
     * NOTE: This intentionally mutates agent objects in place. The agentConfigs Map
     * holds references to config objects that will be passed to the graph runtime.
     */
    const ephemeralAgent = this.options.req.body.ephemeralAgent;
    const mcpManager = getMCPManager();

    const configServers = await resolveConfigServers(this.options.req);

    await Promise.all(
      allAgents.map(({ agent, agentId }) => {
        const agentRunContextParts = [sharedRunContext];
        if (memoryContext && (agentId === this.options.agent.id || memoryAgentEnabled)) {
          agentRunContextParts.push(memoryContext);
        }
        const scopedContext = agentScopedContext.get(agentId);
        if (scopedContext) {
          agentRunContextParts.push(scopedContext);
        }

        return applyContextToAgent({
          agent,
          agentId,
          logger,
          mcpManager,
          configServers,
          sharedRunContext: agentRunContextParts.filter(Boolean).join('\n\n'),
          ephemeralAgent: agentId === this.options.agent.id ? ephemeralAgent : undefined,
        });
      }),
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
      getRoleByName: db.getRoleByName,
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

    const userId = this.options.req.user.id + '';
    this.processMemory = undefined;

    if (!isMemoryAgentEnabled(memoryConfig)) {
      try {
        const { withoutKeys } = await db.getFormattedMemories({ userId });
        return withoutKeys;
      } catch (error) {
        logger.error(
          '[api/server/controllers/agents/client.js #useMemory] Error loading memories',
          error,
        );
        return;
      }
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
        '[api/server/controllers/agents/client.js #useMemory] Error loading agent for memory',
        error,
      );
    }

    if (!prelimAgent) {
      return;
    }

    /** Forward the same `execute_code` capability gate the chat flow uses —
     *  memory agents are unlikely to list `execute_code`, but if one does,
     *  Phase 8 relies on this flag to expand the string into
     *  `bash_tool` + `read_file` (pre-Phase 8 the legacy `execute_code`
     *  tool registered unconditionally; without this passthrough the
     *  memory path would silently lose code-execution tooling). */
    const memoryCapabilities = new Set(appConfig?.endpoints?.[EModelEndpoint.agents]?.capabilities);
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
        codeEnvAvailable: memoryCapabilities.has(AgentCapabilities.execute_code),
      },
      {
        getFiles: db.getFiles,
        getUserKey: db.getUserKey,
        getConvoFiles: db.getConvoFiles,
        updateFilesUsage: db.updateFilesUsage,
        getUserKeyValues: db.getUserKeyValues,
        getToolFilesByIds: db.getToolFilesByIds,
        getCodeGeneratedFiles: db.getCodeGeneratedFiles,
        filterFilesByAgentAccess,
      },
    );

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

    const messageId = this.responseMessageId + '';
    const conversationId = this.conversationId + '';
    const streamId = this.options.req?._resumableStreamId || null;
    const [withoutKeys, processMemory] = await createMemoryProcessor({
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

      /**
       * Strip skill-primed meta messages before memory extraction. The primes
       * sit next to the latest user message and carry large SKILL.md bodies,
       * so letting them into the window would crowd out real chat turns and
       * pollute extracted memories with synthetic instruction content the
       * user never typed.
       */
      const chatMessages = messages.filter((m) => !isSkillPrimeMessage(m));

      let messagesToProcess = [...chatMessages];
      if (chatMessages.length > messageWindowSize) {
        for (let i = chatMessages.length - messageWindowSize; i >= 0; i--) {
          const potentialWindow = chatMessages.slice(i, i + messageWindowSize);
          if (potentialWindow[0]?.role === 'user') {
            messagesToProcess = [...potentialWindow];
            break;
          }
        }

        if (messagesToProcess.length === chatMessages.length) {
          messagesToProcess = [...chatMessages.slice(-messageWindowSize)];
        }
      }

      const filteredMessages = messagesToProcess.map((msg) => this.filterImageUrls(msg));
      const bufferString = getBufferString(filteredMessages);
      const configuredMaxInputTokens = Number.isFinite(memoryConfig?.maxInputTokens)
        ? Math.floor(memoryConfig.maxInputTokens)
        : undefined;
      const maxInputTokens =
        configuredMaxInputTokens != null && configuredMaxInputTokens > 0
          ? configuredMaxInputTokens
          : DEFAULT_MEMORY_MAX_INPUT_TOKENS;
      const maxInputChars = maxInputTokens * MEMORY_INPUT_CHARS_PER_TOKEN;
      const isCharTruncated = bufferString.length > maxInputChars;
      const memoryInput = `# Current Chat:\n\n${
        isCharTruncated
          ? `[Earlier chat content omitted due to memory input limit]\n\n${bufferString.slice(
              -maxInputChars,
            )}`
          : bufferString
      }`;
      const {
        text: limitedMemoryInput,
        tokenCount,
        wasTruncated,
      } = await processTextWithTokenLimit({
        text: memoryInput,
        tokenLimit: maxInputTokens,
        tokenCountFn: (text) => countTokens(text),
        preserve: 'end',
      });
      if (isCharTruncated || wasTruncated) {
        logger.warn('[MemoryAgent] Memory input truncated before processing', {
          tokenCount,
          messageId: this.responseMessageId,
          conversationId: this.conversationId,
          maxInputTokens,
          wasTruncated,
          maxInputChars,
          originalLength: bufferString.length,
        });
      }
      const bufferMessage = new HumanMessage(limitedMemoryInput);
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
    const metadata = this.buildResponseMetadata();
    return metadata ? { completion, metadata } : { completion };
  }

  /**
   * Assembles the response message `metadata`: Vertex thought signatures plus
   * the persisted context breakdown (Part A) and the usage/cost rollup (Part B),
   * which rebuild the gauge breakdown and branch/total cost across reloads.
   * Returns undefined when nothing was captured.
   * @returns {{
   *   thoughtSignatures?: Record<string, string>,
   *   contextUsage?: import('librechat-data-provider').TContextUsageEvent,
   *   usage?: import('librechat-data-provider').TResponseUsage,
   * } | undefined}
   */
  buildResponseMetadata() {
    /** @type {{
     *   thoughtSignatures?: Record<string, string>,
     *   contextUsage?: import('librechat-data-provider').TContextUsageEvent,
     *   usage?: import('librechat-data-provider').TResponseUsage,
     * }} */
    const metadata = {};
    const signatures = this.collectedThoughtSignatures;
    if (signatures && Object.keys(signatures).length > 0) {
      metadata.thoughtSignatures = signatures;
    }
    const usageEvents = this.usageEmitSink ?? [];
    /** Persist the breakdown only when the latest snapshot's OWN run completed —
     *  i.e. a PRIMARY usage event (usage_type == null) from that run's id arrived
     *  AFTER the snapshot. Matching by run id keeps `completedOutputTokens` a real
     *  post-snapshot delta even when parallel/direct runs interleave (A snapshot →
     *  B snapshot → A usage must NOT persist B's snapshot with A's output); an
     *  interrupted final call that emits no usage falls back to the per-message
     *  estimate. It still keeps the post-summary snapshot: the summarization detour
     *  emits an extra snapshot whose following primary usage shares that run's id,
     *  which the old snapshot-count guard miscounted and wrongly dropped. Events
     *  without a run id (older lib / resume) match any snapshot for back-compat. */
    const latestSnapshot = this.contextUsageSink?.latest;
    const latestSnapshotUsageIndex = this.contextUsageSink?.latestUsageIndex ?? 0;
    const latestSnapshotRunId = latestSnapshot?.runId;
    const hasPrimaryAfterSnapshot = usageEvents
      .slice(latestSnapshotUsageIndex)
      .some(
        (event) =>
          event.usage_type == null &&
          (latestSnapshotRunId == null ||
            event.runId == null ||
            event.runId === latestSnapshotRunId),
      );
    if (latestSnapshot && hasPrimaryAfterSnapshot) {
      metadata.contextUsage = buildPersistedContextUsage(latestSnapshot, usageEvents);
    }
    /** Lightweight summarization marker — persisted whenever this turn compacted
     *  the context, INDEPENDENT of the snapshot guard above. When the client has
     *  no usable snapshot on the branch and falls back to the per-message
     *  estimate, it caps the discarded pre-summary history at this baseline
     *  instead of re-summing it (the gauge otherwise reads 100% forever). Shared
     *  with the abort save path via `computeSummaryUsedTokens`. Subtract the
     *  response's earlier tool-loop outputs (the primaries that preceded the
     *  latest snapshot, same run): those tokens are inside the snapshot baseline
     *  AND in the response `tokenCount` the client estimate adds on top, so
     *  leaving them in the marker double-counts them on a multi-call turn. */
    const priorOutputTokens = priorRunOutputTokens(
      usageEvents,
      latestSnapshotUsageIndex,
      latestSnapshotRunId,
    );
    const summaryUsedTokens = computeSummaryUsedTokens(latestSnapshot, priorOutputTokens);
    if (summaryUsedTokens != null) {
      metadata.summaryUsedTokens = summaryUsedTokens;
    }
    const usage = aggregateEmittedUsage(usageEvents);
    if (usage) {
      metadata.usage = usage;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Resolves the endpoint token config for a usage item by its producing agent
   * (multi-endpoint graphs: connected agents + subagents). A known agent's
   * config is authoritative — including `undefined`, which prices with built-in
   * rates (e.g. a non-custom agent in a custom-primary graph). Only an
   * untagged/unknown agent falls back to the primary config, so single-endpoint
   * graphs are unchanged.
   * @param {UsageMetadata} usage
   * @returns {import('@librechat/api').EndpointTokenConfig | undefined}
   */
  resolveAgentEndpointTokenConfig(usage) {
    return resolveAgentTokenConfig({
      agentId: usage?.agentId,
      byAgentId: this.options.endpointTokenConfigByAgentId,
      fallback: this.options.endpointTokenConfig,
    });
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
    const result = await recordCollectedUsage(
      {
        spendTokens: db.spendTokens,
        spendStructuredTokens: db.spendStructuredTokens,
        pricing: { getMultiplier: db.getMultiplier, getCacheMultiplier: db.getCacheMultiplier },
        bulkWriteOps: { insertMany: db.bulkInsertTransactions, updateBalance: db.updateBalance },
      },
      {
        user: this.user ?? this.options.req.user?.id,
        conversationId: this.conversationId,
        collectedUsage,
        model: model ?? this.model ?? this.options.agent.model_parameters.model,
        context,
        messageId: this.responseMessageId,
        balance,
        transactions,
        endpointTokenConfig: this.options.endpointTokenConfig,
        resolveEndpointTokenConfig: (usage) => this.resolveAgentEndpointTokenConfig(usage),
      },
    );

    if (result) {
      this.usage = result;
    }
  }

  /**
   * Get stream usage as returned by this client's API response.
   * @returns {UsageMetadata} The stream usage object.
   */
  getStreamUsage() {
    return this.usage;
  }

  /**
   * Builds the subagent usage emitter for {@link createSubagentUsageSink}.
   * Streams each billed child-run usage to the client as an `on_token_usage`
   * event tagged `subagent` (folds into session cost/totals, not the live
   * gauge), with the authoritative cost when `interface.contextCost` is on.
   * Returns undefined when there's no stream to write to.
   * @param {AppConfig} [appConfig]
   * @returns {((usage: UsageMetadata) => void) | undefined}
   */
  buildSubagentUsageEmitter(appConfig) {
    const res = this.options.res;
    const streamId = this.options.req?._resumableStreamId || null;
    if (!res && !streamId) {
      return undefined;
    }
    const includeCost = appConfig?.interfaceConfig?.contextCost === true;
    return (usage) => {
      const data = {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
        input_token_details: this.subagentCacheDetails(usage),
        model: usage.model,
        provider: usage.provider,
        usage_type: 'subagent',
        runId: this.responseMessageId,
        /** Unique per collected entry (post-push length) for resume dedupe */
        seq: this.collectedUsage.length,
        /** Price with the SUBAGENT's own endpoint token config (its endpoint may
         *  differ from the parent's); `usage.agentId` is tagged by the sink. */
        cost: includeCost
          ? computeUsageCostUSD(
              usage,
              { getMultiplier: db.getMultiplier, getCacheMultiplier: db.getCacheMultiplier },
              this.resolveAgentEndpointTokenConfig(usage),
            )
          : undefined,
      };
      /** Fold into the response's usage rollup (synchronously, regardless of
       *  emit success) so the persisted total matches the live session, which
       *  also folds subagent usage into its cost/totals. */
      if (this.usageEmitSink) {
        this.usageEmitSink.push(data);
      }
      /** The sink fires this without awaiting, so retain the promise and flush
       *  it in chatCompletion's finally — emitChunk persists (HSET) before
       *  publishing, and job cleanup must not race that persist or resumed
       *  clients miss billed subagent usage. */
      const emit = (async () => {
        try {
          if (streamId) {
            await GenerationJobManager.emitChunk(streamId, {
              event: UsageEvents.ON_TOKEN_USAGE,
              data,
            });
          } else {
            sendEvent(res, { event: UsageEvents.ON_TOKEN_USAGE, data });
          }
        } catch (err) {
          logger.warn('[AgentClient] Failed to emit subagent usage', err);
        }
      })();
      this.pendingSubagentEmits.push(emit);
      return emit;
    };
  }

  /** Normalizes a subagent usage event's cache token details for emission. */
  subagentCacheDetails(usage) {
    const cache_creation =
      usage.input_token_details?.cache_creation ?? usage.cache_creation_input_tokens;
    const cache_read = usage.input_token_details?.cache_read ?? usage.cache_read_input_tokens;
    if (cache_creation == null && cache_read == null) {
      return undefined;
    }
    return { cache_creation, cache_read };
  }

  /**
   * @param {TMessage} responseMessage
   * @returns {number}
   */
  getTokenCountForResponse({ content }) {
    return countFormattedMessageTokens({ role: 'assistant', content }, this.getEncoding());
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
        recursionLimit: resolveRecursionLimit(agentsEConfig, this.options.agent),
        signal: abortController.signal,
        streamMode: 'values',
        version: 'v2',
      };

      const toolSet = buildToolSet(this.options.agent);
      const tokenCounter = createTokenCounter(this.getEncoding());

      /** Pre-resolve invoked skill bodies + re-prime files before formatting messages */
      const skillPrimeResult = this.options.primeInvokedSkills
        ? await this.options.primeInvokedSkills(payload)
        : undefined;

      /**
       * Seed `Graph.sessions` with code-env files primed across every
       * reachable agent (primary, handoff/addedConvo, and nested
       * subagents) plus skill-priming output. The merge logic and its
       * run-wide semantics live in `buildInitialToolSessions`; see that
       * helper's doc for why this is intentionally NOT per-agent.
       */
      const initialSessions = buildInitialToolSessions({
        skillSessions: skillPrimeResult?.initialSessions,
        agents: [this.options.agent, ...(this.agentConfigs ? this.agentConfigs.values() : [])],
      });

      /** Spoof `Providers.DEEPSEEK` so the SDK preserves `reasoning_content` on tool turns (#13366). */
      const hasDeepSeekAgent = (agent) =>
        agent != null &&
        isDeepSeekReasoningProvider(agent.provider, agent.model_parameters?.model ?? agent.model);
      const needsDeepSeekFormat =
        hasDeepSeekAgent(this.options.agent) ||
        (this.agentConfigs != null &&
          Array.from(this.agentConfigs.values()).some(hasDeepSeekAgent));
      /**
       * Skills primed fresh this turn — manual ($ popover) and always-apply
       * (frontmatter). `injectSkillPrimes` (below) splices their SKILL.md
       * bodies in, so `formatAgentMessages` must NOT also reconstruct the
       * same names from a historical `skill` tool_call — otherwise the body
       * lands twice and a prompt-cache marker can pin to the duplicated
       * synthetic prefix. Names NOT primed this turn still reconstruct from
       * history, preserving sticky manual re-priming across turns.
       */
      const manualSkillPrimes = this.options.agent?.manualSkillPrimes;
      const alwaysApplySkillPrimes = this.options.agent?.alwaysApplySkillPrimes;
      const freshSkillPrimeNames = collectFreshSkillPrimeNames({
        manualSkillPrimes,
        alwaysApplySkillPrimes,
      });
      const formatOptions =
        needsDeepSeekFormat || freshSkillPrimeNames.size > 0
          ? {
              ...(needsDeepSeekFormat ? { provider: Providers.DEEPSEEK } : {}),
              ...(freshSkillPrimeNames.size > 0
                ? { skipSkillBodyNames: freshSkillPrimeNames }
                : {}),
            }
          : undefined;
      let {
        messages: initialMessages,
        indexTokenCountMap,
        summary: initialSummary,
        boundaryTokenAdjustment,
      } = formatAgentMessages(
        payload,
        this.indexTokenCountMap,
        toolSet,
        skillPrimeResult?.skills,
        formatOptions,
      );
      if (boundaryTokenAdjustment) {
        logger.debug(
          `[AgentClient] Boundary token adjustment: ${boundaryTokenAdjustment.original} → ${boundaryTokenAdjustment.adjusted} (${boundaryTokenAdjustment.remainingChars}/${boundaryTokenAdjustment.totalChars} chars)`,
        );
      }

      /**
       * Skill priming — both manual ($ popover) and always-apply (frontmatter).
       *
       * Splice + index-shift logic lives in `injectSkillPrimes`
       * (packages/api/src/agents/skills.ts) so the delicate position math
       * can be unit-tested in TS without standing up AgentClient. The
       * resolver enforces a combined ceiling (manual-first, always-apply
       * truncated first when over cap) before reaching here; the splice
       * re-applies the cap as defense-in-depth. Runs for both single-
       * agent and multi-agent runs; how primes interact with handoff /
       * added-convo agents' per-agent state is an agents-SDK concern,
       * not this layer's to gate.
       *
       * `manualSkillPrimes` / `alwaysApplySkillPrimes` are resolved above
       * (used to build `freshSkillPrimeNames` for dedupe against historical
       * skill reconstruction).
       */
      if (
        (manualSkillPrimes && manualSkillPrimes.length > 0) ||
        (alwaysApplySkillPrimes && alwaysApplySkillPrimes.length > 0)
      ) {
        const primeResult = injectSkillPrimes({
          initialMessages,
          indexTokenCountMap,
          manualSkillPrimes,
          alwaysApplySkillPrimes,
        });
        indexTokenCountMap = primeResult.indexTokenCountMap;
        if (primeResult.inserted > 0) {
          const manualNames = (manualSkillPrimes ?? []).map((p) => p.name);
          const alwaysApplyNames = (alwaysApplySkillPrimes ?? []).map((p) => p.name);
          logger.debug(
            `[AgentClient] Primed ${primeResult.inserted} skill(s) at message index ${primeResult.insertIdx} — manual: [${manualNames.join(', ')}], always-apply: [${alwaysApplyNames.join(', ')}]`,
          );
        }
        if (primeResult.alwaysApplyDropped > 0) {
          logger.warn(
            `[AgentClient] Dropped ${primeResult.alwaysApplyDropped} always-apply prime(s) to stay within MAX_PRIMED_SKILLS_PER_TURN.`,
          );
        }
      }

      if (indexTokenCountMap && isEnabled(process.env.AGENT_DEBUG_LOGGING)) {
        const entries = Object.entries(indexTokenCountMap);
        const perMsg = entries.map(([idx, count]) => {
          const msg = initialMessages[Number(idx)];
          const type = msg ? msg._getType() : '?';
          return `${idx}:${type}=${count}`;
        });
        logger.debug(
          `[AgentClient] Token map after format: [${perMsg.join(', ')}] (payload=${payload.length}, formatted=${initialMessages.length})`,
        );
      }
      indexTokenCountMap = hydrateMissingIndexTokenCounts({
        messages: initialMessages,
        indexTokenCountMap,
        tokenCounter,
      });

      const memoryMessages =
        this.processMemory && this.memoryPayload
          ? formatAgentMessages(
              this.memoryPayload,
              undefined,
              toolSet,
              skillPrimeResult?.skills,
              formatOptions,
            ).messages
          : initialMessages;

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

        if (this.processMemory) {
          memoryPromise = this.runMemory(memoryMessages);
        }

        /** Seed calibration state from previous run if encoding matches */
        const currentEncoding = this.getEncoding();
        const prevMeta = this.contextMeta;
        const encodingMatch = prevMeta?.encoding === currentEncoding;
        const calibrationRatio =
          encodingMatch && prevMeta?.calibrationRatio > 0 ? prevMeta.calibrationRatio : undefined;

        if (prevMeta) {
          logger.debug(
            `[AgentClient] contextMeta from parent: ratio=${prevMeta.calibrationRatio}, encoding=${prevMeta.encoding}, current=${currentEncoding}, seeded=${calibrationRatio ?? 'none'}`,
          );
        }

        run = await createRun({
          agents,
          messages,
          indexTokenCountMap,
          initialSummary,
          initialSessions,
          calibrationRatio,
          runId: this.responseMessageId,
          signal: abortController.signal,
          customHandlers: this.options.eventHandlers,
          requestBody: config.configurable.requestBody,
          user: createSafeUser(this.options.req?.user),
          summarizationConfig: appConfig?.summarization,
          appConfig,
          tokenCounter,
          /** Bills subagent child-run model calls — child graphs execute
           *  outside the streamEvents loop, so ModelEndHandler never sees
           *  them. Entries land in collectedUsage tagged
           *  `usage_type: 'subagent'` and are spent by recordCollectedUsage.
           *  The sink also streams each as an `on_token_usage` event so the
           *  gauge's session cost/totals include billed subagent usage (the
           *  `subagent` tag keeps it out of the live context meter). */
          subagentUsageSink: createSubagentUsageSink(
            this.collectedUsage,
            this.buildSubagentUsageEmitter(appConfig),
          ),
        });

        if (!run) {
          throw new Error('Failed to create run');
        }

        this.run = run;
        if (this._resolveRun) {
          this._resolveRun(run);
          this._resolveRun = null;
        }

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

      const hideSequentialOutputs = config.configurable.hide_sequential_outputs;
      await runAgents(initialMessages);

      /**
       * Surface a completed `skill` tool_call content part per *manually*-
       * primed skill so the existing `SkillCall` frontend renderer shows
       * a "Skill X loaded" card on the assistant response. Applied after
       * the graph finishes to avoid clashing with the aggregator's own
       * per-step content indexing. Prepended (not appended) so cards sit
       * above the model's output — priming ran before the turn, the
       * reply follows.
       *
       * Always-apply primes intentionally do NOT emit assistant-side
       * cards. `extractInvokedSkillsFromPayload` scans history for
       * `skill` tool_calls and feeds `primeInvokedSkills`, which is
       * Phase 3's sticky-re-prime path — that's the right behavior for
       * manual (user picked `$skill` once; re-prime on every subsequent
       * turn from history). For always-apply, `resolveAlwaysApplySkills`
       * already re-primes every turn from fresh DB state, so persisting
       * the card would cause the skill body to get primed twice per
       * turn starting on turn 2. The user-facing acknowledgement for
       * always-apply lives on the user bubble as the pinned
       * `SkillPills` row (`message.alwaysAppliedSkills`), which
       * is the durable signal the user wants: "this skill auto-primes".
       *
       * Live streaming display of manual user-bubble pills is handled
       * by `SkillPills` reading `message.manualSkills`. No
       * separate SSE emit is needed here; trying to stream a mid-run
       * tool_call at index 0 collided with the LLM's first text
       * content, while emitting at a sparse offset pushed the card
       * below the reply on finalize. Post-run unshift keeps the final
       * responseMessage.content in the right order.
       */
      const manualPrimed = this.options.agent?.manualSkillPrimes ?? [];
      if (manualPrimed.length > 0) {
        const runId = this.responseMessageId ?? 'skill-prime';
        const manualParts = buildSkillPrimeContentParts(manualPrimed, { runId });
        this.contentParts.unshift(...manualParts);
      }

      /** @deprecated Agent Chain */
      if (hideSequentialOutputs) {
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
      /** Capture calibration state from the run for persistence on the response message.
       *  Runs in finally so values are captured even on abort. */
      const ratio = this.run?.getCalibrationRatio() ?? 0;
      if (ratio > 0 && ratio !== 1) {
        this.contextMeta = {
          calibrationRatio: Math.round(ratio * 1000) / 1000,
          encoding: this.getEncoding(),
        };
      } else {
        this.contextMeta = undefined;
      }

      this.finalizeSubagentContent();

      /** Flush subagent usage emits the sink fired without awaiting, so their
       *  persist/publish completes before we return and the job is cleaned up
       *  (resumed clients read this persisted usage). */
      if (this.pendingSubagentEmits.length > 0) {
        await Promise.allSettled(this.pendingSubagentEmits);
        this.pendingSubagentEmits = [];
      }

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
      if (this._resolveRun) {
        this._resolveRun(this.run ?? null);
        this._resolveRun = null;
      }
      run = null;
      config = null;
      memoryPromise = null;
    }
  }

  /**
   * Resolves with the agent run once it is initialized, or `null` if
   * initialization fails. Lets immediate-mode title generation await the run
   * instead of throwing when fired before `chatCompletion` assigns `this.run`.
   * Rejects promptly if the provided signal aborts before the run is ready.
   * @param {AbortSignal} [signal]
   * @returns {Promise<AgentRun | null>}
   */
  _waitForRun(signal) {
    if (this.run) {
      return Promise.resolve(this.run);
    }
    if (!this._runReady) {
      this._runReady = new Promise((resolve) => {
        this._resolveRun = resolve;
      });
    }
    if (!signal) {
      return this._runReady;
    }
    if (signal.aborted) {
      return Promise.reject(new Error('Aborted before run initialization'));
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new Error('Aborted before run initialization'));
      signal.addEventListener('abort', onAbort, { once: true });
      this._runReady.then((run) => {
        signal.removeEventListener('abort', onAbort);
        resolve(run);
      });
    });
  }

  /**
   * @param {Object} params
   * @param {string} params.text
   * @param {AbortController} params.abortController
   * @param {boolean} [params.immediate] When true, the title is generated as soon
   *   as the request is made — the run is awaited (instead of throwing) and the
   *   title derives from the user's input only (`contentParts` is empty).
   */
  async titleConvo({ text, abortController, immediate = false }) {
    if (!this.run) {
      if (!immediate) {
        throw new Error('Run not initialized');
      }
      await this._waitForRun(abortController?.signal);
      if (!this.run) {
        logger.debug(
          '[api/server/controllers/agents/client.js #titleConvo] Run unavailable for immediate title generation',
        );
        return;
      }
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

    /** `omitTitleOptions` drops the Anthropic `clientOptions` carrier (thinking,
     *  streaming, etc.), which would also drop its `defaultHeaders` — preserve the
     *  original `clientOptions` object so gateway/reverse-proxy metadata still
     *  reaches title requests (the proxy may require it for auth/routing). Restore
     *  the SAME object reference, not a copy: the Vertex `createClient` closure from
     *  `getLLMConfig` closes over this object, so `resolveConfigHeaders` must mutate
     *  the very object the client is built from. */
    const anthropicClientOptions = clientOptions?.clientOptions;

    clientOptions = Object.assign(
      Object.fromEntries(
        Object.entries(clientOptions).filter(([key]) => !omitTitleOptions.has(key)),
      ),
    );

    if (anthropicClientOptions?.defaultHeaders != null && clientOptions.clientOptions == null) {
      clientOptions.clientOptions = anthropicClientOptions;
    }

    if (
      provider === Providers.GOOGLE &&
      (endpointConfig?.titleMethod === TitleMethod.FUNCTIONS ||
        endpointConfig?.titleMethod === TitleMethod.STRUCTURED)
    ) {
      clientOptions.json = true;
    }

    /** Resolve request-based headers across provider-specific header locations:
     *  OpenAI `configuration.defaultHeaders`, Anthropic `clientOptions.defaultHeaders`
     *  (preserved above), and Google `customHeaders`.
     */
    resolveConfigHeaders({
      llmConfig: clientOptions,
      user: createSafeUser(this.options.req?.user),
      body: {
        messageId: this.responseMessageId,
        conversationId: this.conversationId,
        parentMessageId: this.parentMessageId,
      },
    });

    try {
      const titleResult = await this.run.generateTitle({
        provider,
        clientOptions,
        inputText: text,
        contentParts: immediate ? [] : this.contentParts,
        titleMethod: endpointConfig?.titleMethod,
        titlePrompt: endpointConfig?.titlePrompt,
        titlePromptTemplate: endpointConfig?.titlePromptTemplate,
        chainOptions: {
          runName: 'TitleRun',
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
        } else if (item.usage_metadata) {
          input_tokens = item.usage_metadata.input_tokens;
          output_tokens = item.usage_metadata.output_tokens;
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
        messageId: this.responseMessageId,
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
      await db.spendTokens(
        {
          model,
          context,
          balance,
          messageId: this.responseMessageId,
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
        await db.spendTokens(
          {
            model,
            balance,
            context: 'reasoning',
            messageId: this.responseMessageId,
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

  /** Anthropic Claude models use a distinct BPE tokenizer; all others default to o200k_base. */
  getEncoding() {
    if (this.model && this.model.toLowerCase().includes('claude')) {
      return 'claude';
    }
    return 'o200k_base';
  }
}

module.exports = AgentClient;
