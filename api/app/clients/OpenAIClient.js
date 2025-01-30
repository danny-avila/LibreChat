const OpenAI = require('openai');
const { OllamaClient } = require('./OllamaClient');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SplitStreamHandler, GraphEvents } = require('@librechat/agents');
const {
  Constants,
  ImageDetail,
  EModelEndpoint,
  resolveHeaders,
  openAISettings,
  ImageDetailCost,
  CohereConstants,
  getResponseSender,
  validateVisionModel,
  mapModelToAzureConfig,
} = require('librechat-data-provider');
const {
  extractBaseURL,
  constructAzureURL,
  getModelMaxTokens,
  genAzureChatCompletion,
  getModelMaxOutputTokens,
} = require('~/utils');
const {
  truncateText,
  formatMessage,
  CUT_OFF_PROMPT,
  titleInstruction,
  createContextHandlers,
} = require('./prompts');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { addSpaceIfNeeded, isEnabled, sleep } = require('~/server/utils');
const Tokenizer = require('~/server/services/Tokenizer');
const { spendTokens } = require('~/models/spendTokens');
const { handleOpenAIErrors } = require('./tools/util');
const { createLLM, RunManager } = require('./llm');
const { logger, sendEvent } = require('~/config');
const ChatGPTClient = require('./ChatGPTClient');
const { summaryBuffer } = require('./memory');
const { runTitleChain } = require('./chains');
const { tokenSplit } = require('./document');
const BaseClient = require('./BaseClient');

class OpenAIClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.ChatGPTClient = new ChatGPTClient();
    this.buildPrompt = this.ChatGPTClient.buildPrompt.bind(this);
    /** @type {getCompletion} */
    this.getCompletion = this.ChatGPTClient.getCompletion.bind(this);
    /** @type {cohereChatCompletion} */
    this.cohereChatCompletion = this.ChatGPTClient.cohereChatCompletion.bind(this);
    this.contextStrategy = options.contextStrategy
      ? options.contextStrategy.toLowerCase()
      : 'discard';
    this.shouldSummarize = this.contextStrategy === 'summarize';
    /** @type {AzureOptions} */
    this.azure = options.azure || false;
    this.setOptions(options);
    this.metadata = {};

    /** @type {string | undefined} - The API Completions URL */
    this.completionsUrl;

    /** @type {OpenAIUsageMetadata | undefined} */
    this.usage;
    /** @type {boolean|undefined} */
    this.isO1Model;
    /** @type {SplitStreamHandler | undefined} */
    this.streamHandler;
  }

  // TODO: PluginsClient calls this 3x, unneeded
  setOptions(options) {
    if (this.options && !this.options.replaceOptions) {
      this.options.modelOptions = {
        ...this.options.modelOptions,
        ...options.modelOptions,
      };
      delete options.modelOptions;
      this.options = {
        ...this.options,
        ...options,
      };
    } else {
      this.options = options;
    }

    if (this.options.openaiApiKey) {
      this.apiKey = this.options.openaiApiKey;
    }

    this.modelOptions = Object.assign(
      {
        model: openAISettings.model.default,
      },
      this.modelOptions,
      this.options.modelOptions,
    );

    this.defaultVisionModel = this.options.visionModel ?? 'gpt-4-vision-preview';
    if (typeof this.options.attachments?.then === 'function') {
      this.options.attachments.then((attachments) => this.checkVisionRequest(attachments));
    } else {
      this.checkVisionRequest(this.options.attachments);
    }

    const o1Pattern = /\bo1\b/i;
    this.isO1Model = o1Pattern.test(this.modelOptions.model);

    const { OPENROUTER_API_KEY, OPENAI_FORCE_PROMPT } = process.env ?? {};
    if (OPENROUTER_API_KEY && !this.azure) {
      this.apiKey = OPENROUTER_API_KEY;
      this.useOpenRouter = true;
    }

    const { reverseProxyUrl: reverseProxy } = this.options;

    if (
      !this.useOpenRouter &&
      reverseProxy &&
      reverseProxy.includes('https://openrouter.ai/api/v1')
    ) {
      this.useOpenRouter = true;
    }

    if (this.options.endpoint?.toLowerCase() === 'ollama') {
      this.isOllama = true;
    }

    this.FORCE_PROMPT =
      isEnabled(OPENAI_FORCE_PROMPT) ||
      (reverseProxy && reverseProxy.includes('completions') && !reverseProxy.includes('chat'));

    if (typeof this.options.forcePrompt === 'boolean') {
      this.FORCE_PROMPT = this.options.forcePrompt;
    }

    if (this.azure && process.env.AZURE_OPENAI_DEFAULT_MODEL) {
      this.azureEndpoint = genAzureChatCompletion(this.azure, this.modelOptions.model, this);
      this.modelOptions.model = process.env.AZURE_OPENAI_DEFAULT_MODEL;
    } else if (this.azure) {
      this.azureEndpoint = genAzureChatCompletion(this.azure, this.modelOptions.model, this);
    }

    const { model } = this.modelOptions;

    this.isChatCompletion =
      o1Pattern.test(model) || model.includes('gpt') || this.useOpenRouter || !!reverseProxy;
    this.isChatGptModel = this.isChatCompletion;
    if (
      model.includes('text-davinci') ||
      model.includes('gpt-3.5-turbo-instruct') ||
      this.FORCE_PROMPT
    ) {
      this.isChatCompletion = false;
      this.isChatGptModel = false;
    }
    const { isChatGptModel } = this;
    this.isUnofficialChatGptModel =
      model.startsWith('text-chat') || model.startsWith('text-davinci-002-render');

    this.maxContextTokens =
      this.options.maxContextTokens ??
      getModelMaxTokens(
        model,
        this.options.endpointType ?? this.options.endpoint,
        this.options.endpointTokenConfig,
      ) ??
      4095; // 1 less than maximum

    if (this.shouldSummarize) {
      this.maxContextTokens = Math.floor(this.maxContextTokens / 2);
    }

    if (this.options.debug) {
      logger.debug('[OpenAIClient] maxContextTokens', this.maxContextTokens);
    }

    this.maxResponseTokens =
      this.modelOptions.max_tokens ??
      getModelMaxOutputTokens(
        model,
        this.options.endpointType ?? this.options.endpoint,
        this.options.endpointTokenConfig,
      ) ??
      1024;
    this.maxPromptTokens =
      this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`,
      );
    }

    this.sender =
      this.options.sender ??
      getResponseSender({
        model: this.modelOptions.model,
        endpoint: this.options.endpoint,
        endpointType: this.options.endpointType,
        modelDisplayLabel: this.options.modelDisplayLabel,
        chatGptLabel: this.options.chatGptLabel || this.options.modelLabel,
      });

    this.userLabel = this.options.userLabel || 'User';
    this.chatGptLabel = this.options.chatGptLabel || 'Assistant';

    this.setupTokens();

    if (reverseProxy) {
      this.completionsUrl = reverseProxy;
      this.langchainProxy = extractBaseURL(reverseProxy);
    } else if (isChatGptModel) {
      this.completionsUrl = 'https://api.openai.com/v1/chat/completions';
    } else {
      this.completionsUrl = 'https://api.openai.com/v1/completions';
    }

    if (this.azureEndpoint) {
      this.completionsUrl = this.azureEndpoint;
    }

    if (this.azureEndpoint && this.options.debug) {
      logger.debug('Using Azure endpoint');
    }

    if (this.useOpenRouter) {
      this.completionsUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    return this;
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
    if (!attachments) {
      return;
    }

    const availableModels = this.options.modelsConfig?.[this.options.endpoint];
    if (!availableModels) {
      return;
    }

    let visionRequestDetected = false;
    for (const file of attachments) {
      if (file?.type?.includes('image')) {
        visionRequestDetected = true;
        break;
      }
    }
    if (!visionRequestDetected) {
      return;
    }

    this.isVisionModel = validateVisionModel({ model: this.modelOptions.model, availableModels });
    if (this.isVisionModel) {
      delete this.modelOptions.stop;
      return;
    }

    for (const model of availableModels) {
      if (!validateVisionModel({ model, availableModels })) {
        continue;
      }
      this.modelOptions.model = model;
      this.isVisionModel = true;
      delete this.modelOptions.stop;
      return;
    }

    if (!availableModels.includes(this.defaultVisionModel)) {
      return;
    }
    if (!validateVisionModel({ model: this.defaultVisionModel, availableModels })) {
      return;
    }

    this.modelOptions.model = this.defaultVisionModel;
    this.isVisionModel = true;
    delete this.modelOptions.stop;
  }

  setupTokens() {
    if (this.isChatCompletion) {
      this.startToken = '||>';
      this.endToken = '';
    } else if (this.isUnofficialChatGptModel) {
      this.startToken = '<|im_start|>';
      this.endToken = '<|im_end|>';
    } else {
      this.startToken = '||>';
      this.endToken = '';
    }
  }

  getEncoding() {
    return this.model?.includes('gpt-4o') ? 'o200k_base' : 'cl100k_base';
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

  /**
   * Calculate the token cost for an image based on its dimensions and detail level.
   *
   * @param {Object} image - The image object.
   * @param {number} image.width - The width of the image.
   * @param {number} image.height - The height of the image.
   * @param {'low'|'high'|string|undefined} [image.detail] - The detail level ('low', 'high', or other).
   * @returns {number} The calculated token cost.
   */
  calculateImageTokenCost({ width, height, detail }) {
    if (detail === 'low') {
      return ImageDetailCost.LOW;
    }

    // Calculate the number of 512px squares
    const numSquares = Math.ceil(width / 512) * Math.ceil(height / 512);

    // Default to high detail cost calculation
    return numSquares * ImageDetailCost.HIGH + ImageDetailCost.ADDITIONAL;
  }

  getSaveOptions() {
    return {
      artifacts: this.options.artifacts,
      maxContextTokens: this.options.maxContextTokens,
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      resendFiles: this.options.resendFiles,
      imageDetail: this.options.imageDetail,
      modelLabel: this.options.modelLabel,
      iconURL: this.options.iconURL,
      greeting: this.options.greeting,
      spec: this.options.spec,
      ...this.modelOptions,
    };
  }

  getBuildMessagesOptions(opts) {
    return {
      isChatCompletion: this.isChatCompletion,
      promptPrefix: opts.promptPrefix,
      abortController: opts.abortController,
    };
  }

  /**
   *
   * Adds image URLs to the message object and returns the files
   *
   * @param {TMessage[]} messages
   * @param {MongoFile[]} files
   * @returns {Promise<MongoFile[]>}
   */
  async addImageURLs(message, attachments) {
    const { files, image_urls } = await encodeAndFormat(
      this.options.req,
      attachments,
      this.options.endpoint,
    );
    message.image_urls = image_urls.length ? image_urls : undefined;
    return files;
  }

  async buildMessages(
    messages,
    parentMessageId,
    { isChatCompletion = false, promptPrefix = null },
    opts,
  ) {
    let orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
      summary: this.shouldSummarize,
    });
    if (!isChatCompletion) {
      return await this.buildPrompt(orderedMessages, {
        isChatGptModel: isChatCompletion,
        promptPrefix,
      });
    }

    let payload;
    let instructions;
    let tokenCountMap;
    let promptTokens;

    promptPrefix = (promptPrefix || this.options.promptPrefix || '').trim();
    if (typeof this.options.artifactsPrompt === 'string' && this.options.artifactsPrompt) {
      promptPrefix = `${promptPrefix ?? ''}\n${this.options.artifactsPrompt}`.trim();
    }

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
        assistantName: this.options?.chatGptLabel,
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

          orderedMessages[i].tokenCount += this.calculateImageTokenCost({
            width: file.width,
            height: file.height,
            detail: this.options.imageDetail ?? ImageDetail.auto,
          });
        }
      }

      return formattedMessage;
    });

    if (this.contextHandlers) {
      this.augmentedPrompt = await this.contextHandlers.createContext();
      promptPrefix = this.augmentedPrompt + promptPrefix;
    }

    if (promptPrefix && this.isO1Model !== true) {
      promptPrefix = `Instructions:\n${promptPrefix.trim()}`;
      instructions = {
        role: 'system',
        content: promptPrefix,
      };

      if (this.contextStrategy) {
        instructions.tokenCount = this.getTokenCountForMessage(instructions);
      }
    }

    // TODO: need to handle interleaving instructions better
    if (this.contextStrategy) {
      ({ payload, tokenCountMap, promptTokens, messages } = await this.handleContextStrategy({
        instructions,
        orderedMessages,
        formattedMessages,
      }));
    }

    const result = {
      prompt: payload,
      promptTokens,
      messages,
    };

    /** EXPERIMENTAL */
    if (promptPrefix && this.isO1Model === true) {
      const lastUserMessageIndex = payload.findLastIndex((message) => message.role === 'user');
      if (lastUserMessageIndex !== -1) {
        payload[
          lastUserMessageIndex
        ].content = `${promptPrefix}\n${payload[lastUserMessageIndex].content}`;
      }
    }

    if (tokenCountMap) {
      tokenCountMap.instructions = instructions?.tokenCount;
      result.tokenCountMap = tokenCountMap;
    }

    if (promptTokens >= 0 && typeof opts?.getReqData === 'function') {
      opts.getReqData({ promptTokens });
    }

    return result;
  }

  /** @type {sendCompletion} */
  async sendCompletion(payload, opts = {}) {
    let reply = '';
    let result = null;
    let streamResult = null;
    this.modelOptions.user = this.user;
    const invalidBaseUrl = this.completionsUrl && extractBaseURL(this.completionsUrl) === null;
    const useOldMethod = !!(invalidBaseUrl || !this.isChatCompletion);
    if (typeof opts.onProgress === 'function' && useOldMethod) {
      const completionResult = await this.getCompletion(
        payload,
        (progressMessage) => {
          if (progressMessage === '[DONE]') {
            return;
          }

          if (progressMessage.choices) {
            streamResult = progressMessage;
          }

          let token = null;
          if (this.isChatCompletion) {
            token =
              progressMessage.choices?.[0]?.delta?.content ?? progressMessage.choices?.[0]?.text;
          } else {
            token = progressMessage.choices?.[0]?.text;
          }

          if (!token && this.useOpenRouter) {
            token = progressMessage.choices?.[0]?.message?.content;
          }
          // first event's delta content is always undefined
          if (!token) {
            return;
          }

          if (token === this.endToken) {
            return;
          }
          opts.onProgress(token);
          reply += token;
        },
        opts.onProgress,
        opts.abortController || new AbortController(),
      );

      if (completionResult && typeof completionResult === 'string') {
        reply = completionResult;
      } else if (
        completionResult &&
        typeof completionResult === 'object' &&
        Array.isArray(completionResult.choices)
      ) {
        reply = completionResult.choices[0]?.text?.replace(this.endToken, '');
      }
    } else if (typeof opts.onProgress === 'function' || this.options.useChatCompletion) {
      reply = await this.chatCompletion({
        payload,
        onProgress: opts.onProgress,
        abortController: opts.abortController,
      });
    } else {
      result = await this.getCompletion(
        payload,
        null,
        opts.onProgress,
        opts.abortController || new AbortController(),
      );

      if (result && typeof result === 'string') {
        return result.trim();
      }

      logger.debug('[OpenAIClient] sendCompletion: result', result);

      if (this.isChatCompletion) {
        reply = result.choices[0].message.content;
      } else {
        reply = result.choices[0].text.replace(this.endToken, '');
      }
    }

    if (streamResult) {
      const { finish_reason } = streamResult.choices[0];
      this.metadata = { finish_reason };
    }
    return (reply ?? '').trim();
  }

  initializeLLM({
    model = 'gpt-4o-mini',
    modelName,
    temperature = 0.2,
    max_tokens,
    streaming,
    context,
    tokenBuffer,
    initialMessageCount,
    conversationId,
  }) {
    const modelOptions = {
      modelName: modelName ?? model,
      temperature,
      user: this.user,
    };

    if (max_tokens) {
      modelOptions.max_tokens = max_tokens;
    }

    const configOptions = {};

    if (this.langchainProxy) {
      configOptions.basePath = this.langchainProxy;
    }

    if (this.useOpenRouter) {
      configOptions.basePath = 'https://openrouter.ai/api/v1';
      configOptions.baseOptions = {
        headers: {
          'HTTP-Referer': 'https://librechat.ai',
          'X-Title': 'LibreChat',
        },
      };
    }

    const { headers } = this.options;
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      configOptions.baseOptions = {
        headers: resolveHeaders({
          ...headers,
          ...configOptions?.baseOptions?.headers,
        }),
      };
    }

    if (this.options.proxy) {
      configOptions.httpAgent = new HttpsProxyAgent(this.options.proxy);
      configOptions.httpsAgent = new HttpsProxyAgent(this.options.proxy);
    }

    const { req, res, debug } = this.options;
    const runManager = new RunManager({ req, res, debug, abortController: this.abortController });
    this.runManager = runManager;

    const llm = createLLM({
      modelOptions,
      configOptions,
      openAIApiKey: this.apiKey,
      azure: this.azure,
      streaming,
      callbacks: runManager.createCallbacks({
        context,
        tokenBuffer,
        conversationId: this.conversationId ?? conversationId,
        initialMessageCount,
      }),
    });

    return llm;
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

    let title = 'New Chat';
    const convo = `||>User:
"${truncateText(text)}"
||>Response:
"${JSON.stringify(truncateText(responseText))}"`;

    const { OPENAI_TITLE_MODEL } = process.env ?? {};

    let model = this.options.titleModel ?? OPENAI_TITLE_MODEL ?? 'gpt-4o-mini';
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
      if (serverless === true) {
        this.options.defaultQuery = azureOptions.azureOpenAIApiVersion
          ? { 'api-version': azureOptions.azureOpenAIApiVersion }
          : undefined;
        this.options.headers['api-key'] = this.apiKey;
      }
    }

    const titleChatCompletion = async () => {
      try {
        modelOptions.model = model;

        if (this.azure) {
          modelOptions.model = process.env.AZURE_OPENAI_DEFAULT_MODEL ?? modelOptions.model;
          this.azureEndpoint = genAzureChatCompletion(this.azure, modelOptions.model, this);
        }

        const instructionsPayload = [
          {
            role: this.options.titleMessageRole ?? (this.isOllama ? 'user' : 'system'),
            content: `Please generate ${titleInstruction}

${convo}

||>Title:`,
          },
        ];

        const promptTokens = this.getTokenCountForMessage(instructionsPayload[0]);

        let useChatCompletion = true;

        if (this.options.reverseProxyUrl === CohereConstants.API_URL) {
          useChatCompletion = false;
        }

        title = (
          await this.sendPayload(instructionsPayload, {
            modelOptions,
            useChatCompletion,
            context: 'title',
          })
        ).replaceAll('"', '');

        const completionTokens = this.getTokenCount(title);

        this.recordTokenUsage({ promptTokens, completionTokens, context: 'title' });
      } catch (e) {
        logger.error(
          '[OpenAIClient] There was an issue generating the title with the completion method',
          e,
        );
      }
    };

    if (this.options.titleMethod === 'completion') {
      await titleChatCompletion();
      logger.debug('[OpenAIClient] Convo Title: ' + title);
      return title;
    }

    try {
      this.abortController = new AbortController();
      const llm = this.initializeLLM({
        ...modelOptions,
        conversationId,
        context: 'title',
        tokenBuffer: 150,
      });

      title = await runTitleChain({ llm, text, convo, signal: this.abortController.signal });
    } catch (e) {
      if (e?.message?.toLowerCase()?.includes('abort')) {
        logger.debug('[OpenAIClient] Aborted title generation');
        return;
      }
      logger.error(
        '[OpenAIClient] There was an issue generating title with LangChain, trying completion method...',
        e,
      );

      await titleChatCompletion();
    }

    logger.debug('[OpenAIClient] Convo Title: ' + title);
    return title;
  }

  /**
   * Get stream usage as returned by this client's API response.
   * @returns {OpenAIUsageMetadata} The stream usage object.
   */
  getStreamUsage() {
    if (
      this.usage &&
      typeof this.usage === 'object' &&
      'completion_tokens_details' in this.usage &&
      this.usage.completion_tokens_details &&
      typeof this.usage.completion_tokens_details === 'object' &&
      'reasoning_tokens' in this.usage.completion_tokens_details
    ) {
      const outputTokens = Math.abs(
        this.usage.completion_tokens_details.reasoning_tokens - this.usage[this.outputTokensKey],
      );
      return {
        ...this.usage.completion_tokens_details,
        [this.inputTokensKey]: this.usage[this.inputTokensKey],
        [this.outputTokensKey]: outputTokens,
      };
    }
    return this.usage;
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

  async summarizeMessages({ messagesToRefine, remainingContextTokens }) {
    logger.debug('[OpenAIClient] Summarizing messages...');
    let context = messagesToRefine;
    let prompt;

    // TODO: remove the gpt fallback and make it specific to endpoint
    const { OPENAI_SUMMARY_MODEL = 'gpt-4o-mini' } = process.env ?? {};
    let model = this.options.summaryModel ?? OPENAI_SUMMARY_MODEL;
    if (model === Constants.CURRENT_MODEL) {
      model = this.modelOptions.model;
    }

    const maxContextTokens =
      getModelMaxTokens(
        model,
        this.options.endpointType ?? this.options.endpoint,
        this.options.endpointTokenConfig,
      ) ?? 4095; // 1 less than maximum

    // 3 tokens for the assistant label, and 98 for the summarizer prompt (101)
    let promptBuffer = 101;

    /*
     * Note: token counting here is to block summarization if it exceeds the spend; complete
     * accuracy is not important. Actual spend will happen after successful summarization.
     */
    const excessTokenCount = context.reduce(
      (acc, message) => acc + message.tokenCount,
      promptBuffer,
    );

    if (excessTokenCount > maxContextTokens) {
      ({ context } = await this.getMessagesWithinTokenLimit({
        messages: context,
        maxContextTokens,
      }));
    }

    if (context.length === 0) {
      logger.debug(
        '[OpenAIClient] Summary context is empty, using latest message within token limit',
      );

      promptBuffer = 32;
      const { text, ...latestMessage } = messagesToRefine[messagesToRefine.length - 1];
      const splitText = await tokenSplit({
        text,
        chunkSize: Math.floor((maxContextTokens - promptBuffer) / 3),
      });

      const newText = `${splitText[0]}\n...[truncated]...\n${splitText[splitText.length - 1]}`;
      prompt = CUT_OFF_PROMPT;

      context = [
        formatMessage({
          message: {
            ...latestMessage,
            text: newText,
          },
          userName: this.options?.name,
          assistantName: this.options?.chatGptLabel,
        }),
      ];
    }
    // TODO: We can accurately count the tokens here before handleChatModelStart
    // by recreating the summary prompt (single message) to avoid LangChain handling

    const initialPromptTokens = this.maxContextTokens - remainingContextTokens;
    logger.debug('[OpenAIClient] initialPromptTokens', initialPromptTokens);

    const llm = this.initializeLLM({
      model,
      temperature: 0.2,
      context: 'summary',
      tokenBuffer: initialPromptTokens,
    });

    try {
      const summaryMessage = await summaryBuffer({
        llm,
        debug: this.options.debug,
        prompt,
        context,
        formatOptions: {
          userName: this.options?.name,
          assistantName: this.options?.chatGptLabel ?? this.options?.modelLabel,
        },
        previous_summary: this.previous_summary?.summary,
        signal: this.abortController.signal,
      });

      const summaryTokenCount = this.getTokenCountForMessage(summaryMessage);

      if (this.options.debug) {
        logger.debug('[OpenAIClient] summaryTokenCount', summaryTokenCount);
        logger.debug(
          `[OpenAIClient] Summarization complete: remainingContextTokens: ${remainingContextTokens}, after refining: ${
            remainingContextTokens - summaryTokenCount
          }`,
        );
      }

      return { summaryMessage, summaryTokenCount };
    } catch (e) {
      if (e?.message?.toLowerCase()?.includes('abort')) {
        logger.debug('[OpenAIClient] Aborted summarization');
        const { run, runId } = this.runManager.getRunByConversationId(this.conversationId);
        if (run && run.error) {
          const { error } = run;
          this.runManager.removeRun(runId);
          throw new Error(error);
        }
      }
      logger.error('[OpenAIClient] Error summarizing messages', e);
      return {};
    }
  }

  /**
   * @param {object} params
   * @param {number} params.promptTokens
   * @param {number} params.completionTokens
   * @param {OpenAIUsageMetadata} [params.usage]
   * @param {string} [params.model]
   * @param {string} [params.context='message']
   * @returns {Promise<void>}
   */
  async recordTokenUsage({ promptTokens, completionTokens, usage, context = 'message' }) {
    await spendTokens(
      {
        context,
        model: this.modelOptions.model,
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
          context: 'reasoning',
          model: this.modelOptions.model,
          conversationId: this.conversationId,
          user: this.user ?? this.options.req.user?.id,
          endpointTokenConfig: this.options.endpointTokenConfig,
        },
        { completionTokens: usage.reasoning_tokens },
      );
    }
  }

  getTokenCountForResponse(response) {
    return this.getTokenCountForMessage({
      role: 'assistant',
      content: response.text,
    });
  }

  getStreamText() {
    if (!this.streamHandler) {
      return '';
    }

    const reasoningTokens =
      this.streamHandler.reasoningTokens.length > 0
        ? `:::thinking\n${this.streamHandler.reasoningTokens.join('')}\n:::\n`
        : '';

    return `${reasoningTokens}${this.streamHandler.tokens.join('')}`;
  }

  getMessageMapMethod() {
    /**
     * @param {TMessage} msg
     */
    return (msg) => {
      if (msg.text != null && msg.text && msg.text.startsWith(':::thinking')) {
        msg.text = msg.text.replace(/:::thinking.*?:::/gs, '').trim();
      }

      return msg;
    };
  }

  async chatCompletion({ payload, onProgress, abortController = null }) {
    let error = null;
    let intermediateReply = [];
    const errorCallback = (err) => (error = err);
    try {
      if (!abortController) {
        abortController = new AbortController();
      }

      let modelOptions = { ...this.modelOptions };

      if (typeof onProgress === 'function') {
        modelOptions.stream = true;
      }
      if (this.isChatCompletion) {
        modelOptions.messages = payload;
      } else {
        modelOptions.prompt = payload;
      }

      const baseURL = extractBaseURL(this.completionsUrl);
      logger.debug('[OpenAIClient] chatCompletion', { baseURL, modelOptions });
      const opts = {
        baseURL,
      };

      if (this.useOpenRouter) {
        opts.defaultHeaders = {
          'HTTP-Referer': 'https://librechat.ai',
          'X-Title': 'LibreChat',
        };
      }

      if (this.options.headers) {
        opts.defaultHeaders = { ...opts.defaultHeaders, ...this.options.headers };
      }

      if (this.options.defaultQuery) {
        opts.defaultQuery = this.options.defaultQuery;
      }

      if (this.options.proxy) {
        opts.httpAgent = new HttpsProxyAgent(this.options.proxy);
      }

      if (this.isVisionModel) {
        modelOptions.max_tokens = 4000;
      }

      /** @type {TAzureConfig | undefined} */
      const azureConfig = this.options?.req?.app?.locals?.[EModelEndpoint.azureOpenAI];

      if (
        (this.azure && this.isVisionModel && azureConfig) ||
        (azureConfig && this.isVisionModel && this.options.endpoint === EModelEndpoint.azureOpenAI)
      ) {
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
        opts.defaultHeaders = resolveHeaders(headers);
        this.langchainProxy = extractBaseURL(baseURL);
        this.apiKey = azureOptions.azureOpenAIApiKey;

        const groupName = modelGroupMap[modelOptions.model].group;
        this.options.addParams = azureConfig.groupMap[groupName].addParams;
        this.options.dropParams = azureConfig.groupMap[groupName].dropParams;
        // Note: `forcePrompt` not re-assigned as only chat models are vision models

        this.azure = !serverless && azureOptions;
        this.azureEndpoint =
          !serverless && genAzureChatCompletion(this.azure, modelOptions.model, this);
        if (serverless === true) {
          this.options.defaultQuery = azureOptions.azureOpenAIApiVersion
            ? { 'api-version': azureOptions.azureOpenAIApiVersion }
            : undefined;
          this.options.headers['api-key'] = this.apiKey;
        }
      }

      if (this.azure || this.options.azure) {
        /* Azure Bug, extremely short default `max_tokens` response */
        if (!modelOptions.max_tokens && modelOptions.model === 'gpt-4-vision-preview') {
          modelOptions.max_tokens = 4000;
        }

        /* Azure does not accept `model` in the body, so we need to remove it. */
        delete modelOptions.model;

        opts.baseURL = this.langchainProxy
          ? constructAzureURL({
            baseURL: this.langchainProxy,
            azureOptions: this.azure,
          })
          : this.azureEndpoint.split(/(?<!\/)\/(chat|completion)\//)[0];

        opts.defaultQuery = { 'api-version': this.azure.azureOpenAIApiVersion };
        opts.defaultHeaders = { ...opts.defaultHeaders, 'api-key': this.apiKey };
      }

      if (this.isO1Model === true && modelOptions.max_tokens != null) {
        modelOptions.max_completion_tokens = modelOptions.max_tokens;
        delete modelOptions.max_tokens;
      }

      if (process.env.OPENAI_ORGANIZATION) {
        opts.organization = process.env.OPENAI_ORGANIZATION;
      }

      let chatCompletion;
      /** @type {OpenAI} */
      const openai = new OpenAI({
        fetch: this.fetch,
        apiKey: this.apiKey,
        ...opts,
      });

      /* Re-orders system message to the top of the messages payload, as not allowed anywhere else */
      if (modelOptions.messages && (opts.baseURL.includes('api.mistral.ai') || this.isOllama)) {
        const { messages } = modelOptions;

        const systemMessageIndex = messages.findIndex((msg) => msg.role === 'system');

        if (systemMessageIndex > 0) {
          const [systemMessage] = messages.splice(systemMessageIndex, 1);
          messages.unshift(systemMessage);
        }

        modelOptions.messages = messages;
      }

      /* If there is only one message and it's a system message, change the role to user */
      if (
        (opts.baseURL.includes('api.mistral.ai') || opts.baseURL.includes('api.perplexity.ai')) &&
        modelOptions.messages &&
        modelOptions.messages.length === 1 &&
        modelOptions.messages[0]?.role === 'system'
      ) {
        modelOptions.messages[0].role = 'user';
      }

      if (this.options.addParams && typeof this.options.addParams === 'object') {
        modelOptions = {
          ...modelOptions,
          ...this.options.addParams,
        };
        logger.debug('[OpenAIClient] chatCompletion: added params', {
          addParams: this.options.addParams,
          modelOptions,
        });
      }

      if (this.options.dropParams && Array.isArray(this.options.dropParams)) {
        this.options.dropParams.forEach((param) => {
          delete modelOptions[param];
        });
        logger.debug('[OpenAIClient] chatCompletion: dropped params', {
          dropParams: this.options.dropParams,
          modelOptions,
        });
      }

      const streamRate = this.options.streamRate ?? Constants.DEFAULT_STREAM_RATE;

      if (this.message_file_map && this.isOllama) {
        const ollamaClient = new OllamaClient({ baseURL, streamRate });
        return await ollamaClient.chatCompletion({
          payload: modelOptions,
          onProgress,
          abortController,
        });
      }

      let UnexpectedRoleError = false;
      /** @type {Promise<void>} */
      let streamPromise;
      /** @type {(value: void | PromiseLike<void>) => void} */
      let streamResolve;

      if (
        this.isO1Model === true &&
        (this.azure || /o1(?!-(?:mini|preview)).*$/.test(modelOptions.model)) &&
        modelOptions.stream
      ) {
        delete modelOptions.stream;
        delete modelOptions.stop;
      }

      let reasoningKey = 'reasoning_content';
      if (this.useOpenRouter) {
        modelOptions.include_reasoning = true;
        reasoningKey = 'reasoning';
      }

      this.streamHandler = new SplitStreamHandler({
        reasoningKey,
        accumulate: true,
        runId: this.responseMessageId,
        handlers: {
          [GraphEvents.ON_RUN_STEP]: (event) => sendEvent(this.options.res, event),
          [GraphEvents.ON_MESSAGE_DELTA]: (event) => sendEvent(this.options.res, event),
          [GraphEvents.ON_REASONING_DELTA]: (event) => sendEvent(this.options.res, event),
        },
      });

      intermediateReply = this.streamHandler.tokens;

      if (modelOptions.stream) {
        streamPromise = new Promise((resolve) => {
          streamResolve = resolve;
        });
        const stream = await openai.beta.chat.completions
          .stream({
            ...modelOptions,
            stream: true,
          })
          .on('abort', () => {
            /* Do nothing here */
          })
          .on('error', (err) => {
            handleOpenAIErrors(err, errorCallback, 'stream');
          })
          .on('finalChatCompletion', async (finalChatCompletion) => {
            const finalMessage = finalChatCompletion?.choices?.[0]?.message;
            if (!finalMessage) {
              return;
            }
            await streamPromise;
            if (finalMessage?.role !== 'assistant') {
              finalChatCompletion.choices[0].message.role = 'assistant';
            }

            if (typeof finalMessage.content !== 'string' || finalMessage.content.trim() === '') {
              finalChatCompletion.choices[0].message.content = this.streamHandler.tokens.join('');
            }
          })
          .on('finalMessage', (message) => {
            if (message?.role !== 'assistant') {
              stream.messages.push({
                role: 'assistant',
                content: this.streamHandler.tokens.join(''),
              });
              UnexpectedRoleError = true;
            }
          });

        if (this.continued === true) {
          const latestText = addSpaceIfNeeded(
            this.currentMessages[this.currentMessages.length - 1]?.text ?? '',
          );
          this.streamHandler.handle({
            choices: [
              {
                delta: {
                  content: latestText,
                },
              },
            ],
          });
        }

        for await (const chunk of stream) {
          this.streamHandler.handle(chunk);
          if (abortController.signal.aborted) {
            stream.controller.abort();
            break;
          }

          await sleep(streamRate);
        }

        streamResolve();

        if (!UnexpectedRoleError) {
          chatCompletion = await stream.finalChatCompletion().catch((err) => {
            handleOpenAIErrors(err, errorCallback, 'finalChatCompletion');
          });
        }
      }
      // regular completion
      else {
        chatCompletion = await openai.chat.completions
          .create({
            ...modelOptions,
          })
          .catch((err) => {
            handleOpenAIErrors(err, errorCallback, 'create');
          });
      }

      if (!chatCompletion && UnexpectedRoleError) {
        throw new Error(
          'OpenAI error: Invalid final message: OpenAI expects final message to include role=assistant',
        );
      } else if (!chatCompletion && error) {
        throw new Error(error);
      } else if (!chatCompletion) {
        throw new Error('Chat completion failed');
      }

      const { choices } = chatCompletion;
      this.usage = chatCompletion.usage;

      if (!Array.isArray(choices) || choices.length === 0) {
        logger.warn('[OpenAIClient] Chat completion response has no choices');
        return this.streamHandler.tokens.join('');
      }

      const { message, finish_reason } = choices[0] ?? {};
      this.metadata = { finish_reason };

      logger.debug('[OpenAIClient] chatCompletion response', chatCompletion);

      if (!message) {
        logger.warn('[OpenAIClient] Message is undefined in chatCompletion response');
        return this.streamHandler.tokens.join('');
      }

      if (typeof message.content !== 'string' || message.content.trim() === '') {
        const reply = this.streamHandler.tokens.join('');
        logger.debug(
          '[OpenAIClient] chatCompletion: using intermediateReply due to empty message.content',
          { intermediateReply: reply },
        );
        return reply;
      }

      if (
        this.streamHandler.reasoningTokens.length > 0 &&
        this.options.context !== 'title' &&
        !message.content.startsWith('<think>')
      ) {
        return this.getStreamText();
      } else if (
        this.streamHandler.reasoningTokens.length > 0 &&
        this.options.context !== 'title' &&
        message.content.startsWith('<think>')
      ) {
        return message.content.replace('<think>', ':::thinking').replace('</think>', ':::');
      }

      return message.content;
    } catch (err) {
      if (
        err?.message?.includes('abort') ||
        (err instanceof OpenAI.APIError && err?.message?.includes('abort'))
      ) {
        return intermediateReply.join('');
      }
      if (
        err?.message?.includes(
          'OpenAI error: Invalid final message: OpenAI expects final message to include role=assistant',
        ) ||
        err?.message?.includes(
          'stream ended without producing a ChatCompletionMessage with role=assistant',
        ) ||
        err?.message?.includes('The server had an error processing your request') ||
        err?.message?.includes('missing finish_reason') ||
        err?.message?.includes('missing role') ||
        (err instanceof OpenAI.OpenAIError && err?.message?.includes('missing finish_reason'))
      ) {
        logger.error('[OpenAIClient] Known OpenAI error:', err);
        if (intermediateReply.length > 0) {
          return intermediateReply.join('');
        } else {
          throw err;
        }
      } else if (err instanceof OpenAI.APIError) {
        if (intermediateReply.length > 0) {
          return intermediateReply.join('');
        } else {
          throw err;
        }
      } else {
        logger.error('[OpenAIClient.chatCompletion] Unhandled error type', err);
        throw err;
      }
    }
  }
}

module.exports = OpenAIClient;
