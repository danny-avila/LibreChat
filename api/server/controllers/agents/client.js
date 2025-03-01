// const { HttpsProxyAgent } = require('https-proxy-agent');
// const {
// Constants,
// ImageDetail,
// EModelEndpoint,
// resolveHeaders,
// validateVisionModel,
// mapModelToAzureConfig,
// } = require('librechat-data-provider');
const { Callback, createMetadataAggregator } = require('@librechat/agents');
const {
  Constants,
  VisionModes,
  openAISchema,
  ContentTypes,
  EModelEndpoint,
  KnownEndpoints,
  anthropicSchema,
  isAgentsEndpoint,
  bedrockOutputParser,
  removeNullishValues,
} = require('librechat-data-provider');
const {
  formatMessage,
  addCacheControl,
  formatAgentMessages,
  formatContentStrings,
  createContextHandlers,
} = require('~/app/clients/prompts');
const { spendTokens, spendStructuredTokens } = require('~/models/spendTokens');
const { getBufferString, HumanMessage } = require('@langchain/core/messages');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const Tokenizer = require('~/server/services/Tokenizer');
const BaseClient = require('~/app/clients/BaseClient');
const { createRun } = require('./run');
const { logger } = require('~/config');

/** @typedef {import('@librechat/agents').MessageContentComplex} MessageContentComplex */
/** @typedef {import('@langchain/core/runnables').RunnableConfig} RunnableConfig */

const providerParsers = {
  [EModelEndpoint.openAI]: openAISchema,
  [EModelEndpoint.azureOpenAI]: openAISchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
  [EModelEndpoint.bedrock]: bedrockOutputParser,
};

const legacyContentEndpoints = new Set([KnownEndpoints.groq, KnownEndpoints.deepseek]);

const noSystemModelRegex = [/\bo1\b/gi];

// const { processMemory, memoryInstructions } = require('~/server/services/Endpoints/agents/memory');
// const { getFormattedMemories } = require('~/models/Memory');
// const { getCurrentDateTime } = require('~/utils');

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
   *
   * Checks if the model is a vision model based on request attachments and sets the appropriate options:
   * - Sets `this.modelOptions.model` to `gpt-4-vision-preview` if the request is a vision request.
   * - Sets `this.isVisionModel` to `true` if vision request.
   * - Deletes `this.modelOptions.stop` if vision request.
   * @param {MongoFile[]} attachments
   */
  checkVisionRequest(attachments) {
    logger.info(
      '[api/server/controllers/agents/client.js #checkVisionRequest] not implemented',
      attachments,
    );
    // if (!attachments) {
    //   return;
    // }

    // const availableModels = this.options.modelsConfig?.[this.options.endpoint];
    // if (!availableModels) {
    //   return;
    // }

    // let visionRequestDetected = false;
    // for (const file of attachments) {
    //   if (file?.type?.includes('image')) {
    //     visionRequestDetected = true;
    //     break;
    //   }
    // }
    // if (!visionRequestDetected) {
    //   return;
    // }

    // this.isVisionModel = validateVisionModel({ model: this.modelOptions.model, availableModels });
    // if (this.isVisionModel) {
    //   delete this.modelOptions.stop;
    //   return;
    // }

    // for (const model of availableModels) {
    //   if (!validateVisionModel({ model, availableModels })) {
    //     continue;
    //   }
    //   this.modelOptions.model = model;
    //   this.isVisionModel = true;
    //   delete this.modelOptions.stop;
    //   return;
    // }

    // if (!availableModels.includes(this.defaultVisionModel)) {
    //   return;
    // }
    // if (!validateVisionModel({ model: this.defaultVisionModel, availableModels })) {
    //   return;
    // }

    // this.modelOptions.model = this.defaultVisionModel;
    // this.isVisionModel = true;
    // delete this.modelOptions.stop;
  }

  getSaveOptions() {
    const parseOptions = providerParsers[this.options.endpoint];
    let runOptions =
      this.options.endpoint === EModelEndpoint.agents
        ? {
          model: undefined,
          // TODO:
          // would need to be override settings; otherwise, model needs to be undefined
          // model: this.override.model,
          // instructions: this.override.instructions,
          // additional_instructions: this.override.additional_instructions,
        }
        : {};

    if (parseOptions) {
      runOptions = parseOptions(this.options.agent.model_parameters);
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
    // this.systemMessage = getCurrentDateTime();
    // const { withKeys, withoutKeys } = await getFormattedMemories({
    //   userId: this.options.req.user.id,
    // });
    // processMemory({
    //   userId: this.options.req.user.id,
    //   message: this.options.req.body.text,
    //   parentMessageId,
    //   memory: withKeys,
    //   thread_id: this.conversationId,
    // }).catch((error) => {
    //   logger.error('Memory Agent failed to process memory', error);
    // });

    // this.systemMessage += '\n\n' + memoryInstructions;
    // if (withoutKeys) {
    //   this.systemMessage += `\n\n# Existing memory about the user:\n${withoutKeys}`;
    // }

    if (this.options.attachments) {
      const attachments = await this.options.attachments;

      if (this.message_file_map) {
        this.message_file_map[orderedMessages[orderedMessages.length - 1].messageId] = attachments;
      } else {
        this.message_file_map = {
          [orderedMessages[orderedMessages.length - 1].messageId]: attachments,
        };
      }

      const files = await this.addImageURLs(
        orderedMessages[orderedMessages.length - 1],
        attachments,
      );

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

      const needsTokenCount = this.contextStrategy && !orderedMessages[i].tokenCount;

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

    const result = {
      tokenCountMap,
      prompt: payload,
      promptTokens,
      messages,
    };

    if (promptTokens >= 0 && typeof opts?.getReqData === 'function') {
      opts.getReqData({ promptTokens });
    }

    return result;
  }

  /** @type {sendCompletion} */
  async sendCompletion(payload, opts = {}) {
    await this.chatCompletion({
      payload,
      onProgress: opts.onProgress,
      abortController: opts.abortController,
    });
    return this.contentParts;
  }

  /**
   * @param {Object} params
   * @param {string} [params.model]
   * @param {string} [params.context='message']
   * @param {UsageMetadata[]} [params.collectedUsage=this.collectedUsage]
   */
  async recordCollectedUsage({ model, context = 'message', collectedUsage = this.collectedUsage }) {
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

  async chatCompletion({ payload, abortController = null }) {
    try {
      if (!abortController) {
        abortController = new AbortController();
      }

      // if (this.options.headers) {
      //   opts.defaultHeaders = { ...opts.defaultHeaders, ...this.options.headers };
      // }

      // if (this.options.proxy) {
      //   opts.httpAgent = new HttpsProxyAgent(this.options.proxy);
      // }

      // if (this.isVisionModel) {
      //   modelOptions.max_tokens = 4000;
      // }

      // /** @type {TAzureConfig | undefined} */
      // const azureConfig = this.options?.req?.app?.locals?.[EModelEndpoint.azureOpenAI];

      // if (
      //   (this.azure && this.isVisionModel && azureConfig) ||
      //   (azureConfig && this.isVisionModel && this.options.endpoint === EModelEndpoint.azureOpenAI)
      // ) {
      //   const { modelGroupMap, groupMap } = azureConfig;
      //   const {
      //     azureOptions,
      //     baseURL,
      //     headers = {},
      //     serverless,
      //   } = mapModelToAzureConfig({
      //     modelName: modelOptions.model,
      //     modelGroupMap,
      //     groupMap,
      //   });
      //   opts.defaultHeaders = resolveHeaders(headers);
      //   this.langchainProxy = extractBaseURL(baseURL);
      //   this.apiKey = azureOptions.azureOpenAIApiKey;

      //   const groupName = modelGroupMap[modelOptions.model].group;
      //   this.options.addParams = azureConfig.groupMap[groupName].addParams;
      //   this.options.dropParams = azureConfig.groupMap[groupName].dropParams;
      //   // Note: `forcePrompt` not re-assigned as only chat models are vision models

      //   this.azure = !serverless && azureOptions;
      //   this.azureEndpoint =
      //     !serverless && genAzureChatCompletion(this.azure, modelOptions.model, this);
      // }

      // if (this.azure || this.options.azure) {
      //   /* Azure Bug, extremely short default `max_tokens` response */
      //   if (!modelOptions.max_tokens && modelOptions.model === 'gpt-4-vision-preview') {
      //     modelOptions.max_tokens = 4000;
      //   }

      //   /* Azure does not accept `model` in the body, so we need to remove it. */
      //   delete modelOptions.model;

      //   opts.baseURL = this.langchainProxy
      //     ? constructAzureURL({
      //       baseURL: this.langchainProxy,
      //       azureOptions: this.azure,
      //     })
      //     : this.azureEndpoint.split(/(?<!\/)\/(chat|completion)\//)[0];

      //   opts.defaultQuery = { 'api-version': this.azure.azureOpenAIApiVersion };
      //   opts.defaultHeaders = { ...opts.defaultHeaders, 'api-key': this.apiKey };
      // }

      // if (process.env.OPENAI_ORGANIZATION) {
      //   opts.organization = process.env.OPENAI_ORGANIZATION;
      // }

      // if (this.options.addParams && typeof this.options.addParams === 'object') {
      //   modelOptions = {
      //     ...modelOptions,
      //     ...this.options.addParams,
      //   };
      //   logger.debug('[api/server/controllers/agents/client.js #chatCompletion] added params', {
      //     addParams: this.options.addParams,
      //     modelOptions,
      //   });
      // }

      // if (this.options.dropParams && Array.isArray(this.options.dropParams)) {
      //   this.options.dropParams.forEach((param) => {
      //     delete modelOptions[param];
      //   });
      //   logger.debug('[api/server/controllers/agents/client.js #chatCompletion] dropped params', {
      //     dropParams: this.options.dropParams,
      //     modelOptions,
      //   });
      // }

      /** @type {Partial<RunnableConfig> & { version: 'v1' | 'v2'; run_id?: string; streamMode: string }} */
      const config = {
        configurable: {
          thread_id: this.conversationId,
          last_agent_index: this.agentConfigs?.size ?? 0,
          hide_sequential_outputs: this.options.agent.hide_sequential_outputs,
        },
        recursionLimit: this.options.req.app.locals[EModelEndpoint.agents]?.recursionLimit,
        signal: abortController.signal,
        streamMode: 'values',
        version: 'v2',
      };

      const initialMessages = formatAgentMessages(payload);
      if (legacyContentEndpoints.has(this.options.agent.endpoint)) {
        formatContentStrings(initialMessages);
      }

      /** @type {ReturnType<createRun>} */
      let run;

      /**
       *
       * @param {Agent} agent
       * @param {BaseMessage[]} messages
       * @param {number} [i]
       * @param {TMessageContentParts[]} [contentData]
       */
      const runAgent = async (agent, _messages, i = 0, contentData = []) => {
        config.configurable.model = agent.model_parameters.model;
        if (i > 0) {
          this.model = agent.model_parameters.model;
        }
        config.configurable.agent_id = agent.id;
        config.configurable.name = agent.name;
        config.configurable.agent_index = i;
        const noSystemMessages = noSystemModelRegex.some((regex) =>
          agent.model_parameters.model.match(regex),
        );

        const systemMessage = Object.values(agent.toolContextMap ?? {})
          .join('\n')
          .trim();

        let systemContent = [
          systemMessage,
          agent.instructions ?? '',
          i !== 0 ? (agent.additional_instructions ?? '') : '',
        ]
          .join('\n')
          .trim();

        if (noSystemMessages === true) {
          agent.instructions = undefined;
          agent.additional_instructions = undefined;
        } else {
          agent.instructions = systemContent;
          agent.additional_instructions = undefined;
        }

        if (noSystemMessages === true && systemContent?.length) {
          let latestMessage = _messages.pop().content;
          if (typeof latestMessage !== 'string') {
            latestMessage = latestMessage[0].text;
          }
          latestMessage = [systemContent, latestMessage].join('\n');
          _messages.push(new HumanMessage(latestMessage));
        }

        let messages = _messages;
        if (
          agent.model_parameters?.clientOptions?.defaultHeaders?.['anthropic-beta']?.includes(
            'prompt-caching',
          )
        ) {
          messages = addCacheControl(messages);
        }

        run = await createRun({
          agent,
          req: this.options.req,
          runId: this.responseMessageId,
          signal: abortController.signal,
          customHandlers: this.options.eventHandlers,
        });

        if (!run) {
          throw new Error('Failed to create run');
        }

        if (i === 0) {
          this.run = run;
        }

        if (contentData.length) {
          run.Graph.contentData = contentData;
        }

        await run.processStream({ messages }, config, {
          keepContent: i !== 0,
          callbacks: {
            [Callback.TOOL_ERROR]: (graph, error, toolId) => {
              logger.error(
                '[api/server/controllers/agents/client.js #chatCompletion] Tool Error',
                error,
                toolId,
              );
            },
          },
        });
      };

      await runAgent(this.options.agent, initialMessages);

      let finalContentStart = 0;
      if (this.agentConfigs && this.agentConfigs.size > 0) {
        let latestMessage = initialMessages.pop().content;
        if (typeof latestMessage !== 'string') {
          latestMessage = latestMessage[0].text;
        }
        let i = 1;
        let runMessages = [];

        const lastFiveMessages = initialMessages.slice(-5);
        for (const [agentId, agent] of this.agentConfigs) {
          if (abortController.signal.aborted === true) {
            break;
          }
          const currentRun = await run;

          if (
            i === this.agentConfigs.size &&
            config.configurable.hide_sequential_outputs === true
          ) {
            const content = this.contentParts.filter(
              (part) => part.type === ContentTypes.TOOL_CALL,
            );

            this.options.res.write(
              `event: message\ndata: ${JSON.stringify({
                event: 'on_content_update',
                data: {
                  runId: this.responseMessageId,
                  content,
                },
              })}\n\n`,
            );
          }
          const _runMessages = currentRun.Graph.getRunMessages();
          finalContentStart = this.contentParts.length;
          runMessages = runMessages.concat(_runMessages);
          const contentData = currentRun.Graph.contentData.slice();
          const bufferString = getBufferString([new HumanMessage(latestMessage), ...runMessages]);
          if (i === this.agentConfigs.size) {
            logger.debug(`SEQUENTIAL AGENTS: Last buffer string:\n${bufferString}`);
          }
          try {
            const contextMessages = [];
            for (const message of lastFiveMessages) {
              const messageType = message._getType();
              if (
                (!agent.tools || agent.tools.length === 0) &&
                (messageType === 'tool' || (message.tool_calls?.length ?? 0) > 0)
              ) {
                continue;
              }

              contextMessages.push(message);
            }
            const currentMessages = [...contextMessages, new HumanMessage(bufferString)];
            await runAgent(agent, currentMessages, i, contentData);
          } catch (err) {
            logger.error(
              `[api/server/controllers/agents/client.js #chatCompletion] Error running agent ${agentId} (${i})`,
              err,
            );
          }
          i++;
        }
      }

      if (config.configurable.hide_sequential_outputs !== true) {
        finalContentStart = 0;
      }

      this.contentParts = this.contentParts.filter((part, index) => {
        // Include parts that are either:
        // 1. At or after the finalContentStart index
        // 2. Of type tool_call
        // 3. Have tool_call_ids property
        return (
          index >= finalContentStart || part.type === ContentTypes.TOOL_CALL || part.tool_call_ids
        );
      });

      try {
        await this.recordCollectedUsage({ context: 'message' });
      } catch (err) {
        logger.error(
          '[api/server/controllers/agents/client.js #chatCompletion] Error recording collected usage',
          err,
        );
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        logger.error(
          '[api/server/controllers/agents/client.js #sendCompletion] Unhandled error type',
          err,
        );
        throw err;
      }

      logger.warn(
        '[api/server/controllers/agents/client.js #sendCompletion] Operation aborted',
        err,
      );
    }
  }

  /**
   *
   * @param {Object} params
   * @param {string} params.text
   * @param {string} params.conversationId
   */
  async titleConvo({ text }) {
    if (!this.run) {
      throw new Error('Run not initialized');
    }
    const { handleLLMEnd, collected: collectedMetadata } = createMetadataAggregator();
    /** @type {import('@librechat/agents').ClientOptions} */
    const clientOptions = {
      maxTokens: 75,
    };
    const providerConfig = this.options.req.app.locals[this.options.agent.provider];
    if (
      providerConfig &&
      providerConfig.titleModel &&
      providerConfig.titleModel !== Constants.CURRENT_MODEL
    ) {
      clientOptions.model = providerConfig.titleModel;
    }
    try {
      const titleResult = await this.run.generateTitle({
        inputText: text,
        contentParts: this.contentParts,
        clientOptions,
        chainOptions: {
          callbacks: [
            {
              handleLLMEnd,
            },
          ],
        },
      });

      const collectedUsage = collectedMetadata.map((item) => {
        let input_tokens, output_tokens;

        if (item.usage) {
          input_tokens = item.usage.input_tokens || item.usage.inputTokens;
          output_tokens = item.usage.output_tokens || item.usage.outputTokens;
        } else if (item.tokenUsage) {
          input_tokens = item.tokenUsage.promptTokens;
          output_tokens = item.tokenUsage.completionTokens;
        }

        return {
          input_tokens: input_tokens,
          output_tokens: output_tokens,
        };
      });

      this.recordCollectedUsage({
        model: clientOptions.model,
        context: 'title',
        collectedUsage,
      }).catch((err) => {
        logger.error(
          '[api/server/controllers/agents/client.js #titleConvo] Error recording collected usage',
          err,
        );
      });

      return titleResult.title;
    } catch (err) {
      logger.error('[api/server/controllers/agents/client.js #titleConvo] Error', err);
      return;
    }
  }

  /** Silent method, as `recordCollectedUsage` is used instead */
  async recordTokenUsage() {}

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
