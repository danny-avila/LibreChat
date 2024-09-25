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
  EModelEndpoint,
  bedrockOutputParser,
  providerEndpointMap,
  removeNullishValues,
} = require('librechat-data-provider');
const {
  extractBaseURL,
  // constructAzureURL,
  // genAzureChatCompletion,
} = require('~/utils');
const {
  formatMessage,
  formatAgentMessages,
  createContextHandlers,
} = require('~/app/clients/prompts');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const Tokenizer = require('~/server/services/Tokenizer');
const { spendTokens } = require('~/models/spendTokens');
const BaseClient = require('~/app/clients/BaseClient');
// const { sleep } = require('~/server/utils');
const { createRun } = require('./run');
const { logger } = require('~/config');

/** @typedef {import('@librechat/agents').MessageContentComplex} MessageContentComplex */

// const providerSchemas = {
// [EModelEndpoint.bedrock]: true,
// };

const providerParsers = {
  [EModelEndpoint.bedrock]: bedrockOutputParser,
};

class AgentClient extends BaseClient {
  constructor(options = {}) {
    super(null, options);

    /** @type {'discard' | 'summarize'} */
    this.contextStrategy = 'discard';

    /** @deprecated @type {true} - Is a Chat Completion Request */
    this.isChatCompletion = true;

    /** @type {AgentRun} */
    this.run;

    const {
      contentParts,
      collectedUsage,
      artifactPromises,
      maxContextTokens,
      modelOptions = {},
      ...clientOptions
    } = options;

    this.modelOptions = modelOptions;
    this.maxContextTokens = maxContextTokens;
    /** @type {MessageContentComplex[]} */
    this.contentParts = contentParts;
    /** @type {Array<UsageMetadata>} */
    this.collectedUsage = collectedUsage;
    /** @type {ArtifactPromises} */
    this.artifactPromises = artifactPromises;
    this.options = Object.assign({ endpoint: options.endpoint }, clientOptions);
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
      runOptions = parseOptions(this.modelOptions);
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
        },
        // TODO: PARSE OPTIONS BY PROVIDER, MAY CONTAIN SENSITIVE DATA
        runOptions,
      ),
    );
  }

  getBuildMessagesOptions(opts) {
    return {
      instructions: opts.instructions,
      additional_instructions: opts.additional_instructions,
    };
  }

  async addImageURLs(message, attachments) {
    const { files, image_urls } = await encodeAndFormat(
      this.options.req,
      attachments,
      this.options.agent.provider,
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
    /** @type {{ role: string; name: string; content: string } | undefined} */
    let systemMessage;
    /** @type {number | undefined} */
    let promptTokens;

    /** @type {string} */
    let systemContent = `${instructions ?? ''}${additional_instructions ?? ''}`;

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

    if (this.message_file_map) {
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
      // if (this.message_file_map && this.message_file_map[message.messageId]) {
      //   const attachments = this.message_file_map[message.messageId];
      //   for (const file of attachments) {
      //     if (file.embedded) {
      //       this.contextHandlers?.processFile(file);
      //       continue;
      //     }

      //     orderedMessages[i].tokenCount += this.calculateImageTokenCost({
      //       width: file.width,
      //       height: file.height,
      //       detail: this.options.imageDetail ?? ImageDetail.auto,
      //     });
      //   }
      // }

      return formattedMessage;
    });

    if (this.contextHandlers) {
      this.augmentedPrompt = await this.contextHandlers.createContext();
      systemContent = this.augmentedPrompt + systemContent;
    }

    if (systemContent) {
      systemContent = `${systemContent.trim()}`;
      systemMessage = {
        role: 'system',
        name: 'instructions',
        content: systemContent,
      };

      if (this.contextStrategy) {
        const instructionTokens = this.getTokenCountForMessage(systemMessage);
        if (instructionTokens >= 0) {
          const firstMessageTokens = orderedMessages[0].tokenCount ?? 0;
          orderedMessages[0].tokenCount = firstMessageTokens + instructionTokens;
        }
      }
    }

    if (this.contextStrategy) {
      ({ payload, promptTokens, messages } = await this.handleContextStrategy({
        orderedMessages,
        formattedMessages,
        /* prefer usage_metadata from final message */
        buildTokenMap: false,
      }));
    }

    const result = {
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
    this.modelOptions.user = this.user;
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
    for (const usage of collectedUsage) {
      await spendTokens(
        {
          context,
          model: model ?? this.modelOptions.model,
          conversationId: this.conversationId,
          user: this.user ?? this.options.req.user?.id,
          endpointTokenConfig: this.options.endpointTokenConfig,
        },
        { promptTokens: usage.input_tokens, completionTokens: usage.output_tokens },
      );
    }
  }

  async chatCompletion({ payload, abortController = null }) {
    try {
      if (!abortController) {
        abortController = new AbortController();
      }

      const baseURL = extractBaseURL(this.completionsUrl);
      logger.debug('[api/server/controllers/agents/client.js] chatCompletion', {
        baseURL,
        payload,
      });

      // if (this.useOpenRouter) {
      //   opts.defaultHeaders = {
      //     'HTTP-Referer': 'https://librechat.ai',
      //     'X-Title': 'LibreChat',
      //   };
      // }

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

      const run = await createRun({
        req: this.options.req,
        agent: this.options.agent,
        tools: this.options.tools,
        toolMap: this.options.toolMap,
        runId: this.responseMessageId,
        modelOptions: this.modelOptions,
        customHandlers: this.options.eventHandlers,
      });

      const config = {
        configurable: {
          provider: providerEndpointMap[this.options.agent.provider],
          thread_id: this.conversationId,
        },
        run_id: this.responseMessageId,
        signal: abortController.signal,
        streamMode: 'values',
        version: 'v2',
      };

      if (!run) {
        throw new Error('Failed to create run');
      }

      this.run = run;

      const messages = formatAgentMessages(payload);
      await run.processStream({ messages }, config, {
        [Callback.TOOL_ERROR]: (graph, error, toolId) => {
          logger.error(
            '[api/server/controllers/agents/client.js #chatCompletion] Tool Error',
            error,
            toolId,
          );
        },
      });
      await Promise.all(this.artifactPromises);
      this.recordCollectedUsage({ context: 'message' }).catch((err) => {
        logger.error(
          '[api/server/controllers/agents/client.js #chatCompletion] Error recording collected usage',
          err,
        );
      });
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
    const clientOptions = {};
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

  getEncoding() {
    return this.modelOptions.model?.includes('gpt-4o') ? 'o200k_base' : 'cl100k_base';
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
