const OpenAI = require('openai');
const { HttpsProxyAgent } = require('https-proxy-agent');
const {
  Constants,
  ImageDetail,
  EModelEndpoint,
  resolveHeaders,
  ImageDetailCost,
  CohereConstants,
  getResponseSender,
  validateVisionModel,
  mapModelToAzureConfig,
} = require('librechat-data-provider');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('tiktoken');
const {
  extractBaseURL,
  constructAzureURL,
  getModelMaxTokens,
  genAzureChatCompletion,
} = require('~/utils');
const {
  truncateText,
  formatMessage,
  CUT_OFF_PROMPT,
  titleInstruction,
  createContextHandlers,
} = require('./prompts');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { handleOpenAIErrors } = require('./tools/util');
const spendTokens = require('~/models/spendTokens');
const { createLLM, RunManager } = require('./llm');
const ChatGPTClient = require('./ChatGPTClient');
const { isEnabled } = require('~/server/utils');
const { summaryBuffer } = require('./memory');
const { runTitleChain } = require('./chains');
const { tokenSplit } = require('./document');
const BaseClient = require('./BaseClient');
const { logger } = require('~/config');

// Cache to store Tiktoken instances
const tokenizersCache = {};
// Counter for keeping track of the number of tokenizer calls
let tokenizerCallsCount = 0;

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

    const modelOptions = this.options.modelOptions || {};

    if (!this.modelOptions) {
      this.modelOptions = {
        ...modelOptions,
        model: modelOptions.model || 'gpt-3.5-turbo',
        temperature:
          typeof modelOptions.temperature === 'undefined' ? 0.8 : modelOptions.temperature,
        top_p: typeof modelOptions.top_p === 'undefined' ? 1 : modelOptions.top_p,
        presence_penalty:
          typeof modelOptions.presence_penalty === 'undefined' ? 1 : modelOptions.presence_penalty,
        stop: modelOptions.stop,
      };
    } else {
      // Update the modelOptions if it already exists
      this.modelOptions = {
        ...this.modelOptions,
        ...modelOptions,
      };
    }

    this.defaultVisionModel = this.options.visionModel ?? 'gpt-4-vision-preview';
    if (typeof this.options.attachments?.then === 'function') {
      this.options.attachments.then((attachments) => this.checkVisionRequest(attachments));
    } else {
      this.checkVisionRequest(this.options.attachments);
    }

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

    this.isChatCompletion = this.useOpenRouter || !!reverseProxy || model.includes('gpt');
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
      getModelMaxTokens(
        model,
        this.options.endpointType ?? this.options.endpoint,
        this.options.endpointTokenConfig,
      ) ?? 4095; // 1 less than maximum

    if (this.shouldSummarize) {
      this.maxContextTokens = Math.floor(this.maxContextTokens / 2);
    }

    if (this.options.debug) {
      logger.debug('[OpenAIClient] maxContextTokens', this.maxContextTokens);
    }

    this.maxResponseTokens = this.modelOptions.max_tokens || 1024;
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
        chatGptLabel: this.options.chatGptLabel,
        modelDisplayLabel: this.options.modelDisplayLabel,
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
    const availableModels = this.options.modelsConfig?.[this.options.endpoint];
    this.isVisionModel = validateVisionModel({ model: this.modelOptions.model, availableModels });

    const visionModelAvailable = availableModels?.includes(this.defaultVisionModel);
    if (
      attachments &&
      attachments.some((file) => file?.type && file?.type?.includes('image')) &&
      visionModelAvailable &&
      !this.isVisionModel
    ) {
      this.modelOptions.model = this.defaultVisionModel;
      this.isVisionModel = true;
    }

    if (this.isVisionModel) {
      delete this.modelOptions.stop;
    }
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

  // Selects an appropriate tokenizer based on the current configuration of the client instance.
  // It takes into account factors such as whether it's a chat completion, an unofficial chat GPT model, etc.
  selectTokenizer() {
    let tokenizer;
    this.encoding = 'text-davinci-003';
    if (this.isChatCompletion) {
      this.encoding = 'cl100k_base';
      tokenizer = this.constructor.getTokenizer(this.encoding);
    } else if (this.isUnofficialChatGptModel) {
      const extendSpecialTokens = {
        '<|im_start|>': 100264,
        '<|im_end|>': 100265,
      };
      tokenizer = this.constructor.getTokenizer(this.encoding, true, extendSpecialTokens);
    } else {
      try {
        const { model } = this.modelOptions;
        this.encoding = model.includes('instruct') ? 'text-davinci-003' : model;
        tokenizer = this.constructor.getTokenizer(this.encoding, true);
      } catch {
        tokenizer = this.constructor.getTokenizer('text-davinci-003', true);
      }
    }

    return tokenizer;
  }

  // Retrieves a tokenizer either from the cache or creates a new one if one doesn't exist in the cache.
  // If a tokenizer is being created, it's also added to the cache.
  static getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
    let tokenizer;
    if (tokenizersCache[encoding]) {
      tokenizer = tokenizersCache[encoding];
    } else {
      if (isModelName) {
        tokenizer = encodingForModel(encoding, extendSpecialTokens);
      } else {
        tokenizer = getEncoding(encoding, extendSpecialTokens);
      }
      tokenizersCache[encoding] = tokenizer;
    }
    return tokenizer;
  }

  // Frees all encoders in the cache and resets the count.
  static freeAndResetAllEncoders() {
    try {
      Object.keys(tokenizersCache).forEach((key) => {
        if (tokenizersCache[key]) {
          tokenizersCache[key].free();
          delete tokenizersCache[key];
        }
      });
      // Reset count
      tokenizerCallsCount = 1;
    } catch (error) {
      logger.error('[OpenAIClient] Free and reset encoders error', error);
    }
  }

  // Checks if the cache of tokenizers has reached a certain size. If it has, it frees and resets all tokenizers.
  resetTokenizersIfNecessary() {
    if (tokenizerCallsCount >= 25) {
      if (this.options.debug) {
        logger.debug('[OpenAIClient] freeAndResetAllEncoders: reached 25 encodings, resetting...');
      }
      this.constructor.freeAndResetAllEncoders();
    }
    tokenizerCallsCount++;
  }

  /**
   * Returns the token count of a given text. It also checks and resets the tokenizers if necessary.
   * @param {string} text - The text to get the token count for.
   * @returns {number} The token count of the given text.
   */
  getTokenCount(text) {
    this.resetTokenizersIfNecessary();
    try {
      const tokenizer = this.selectTokenizer();
      return tokenizer.encode(text, 'all').length;
    } catch (error) {
      this.constructor.freeAndResetAllEncoders();
      const tokenizer = this.selectTokenizer();
      return tokenizer.encode(text, 'all').length;
    }
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
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      resendFiles: this.options.resendFiles,
      imageDetail: this.options.imageDetail,
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
    const { files, image_urls } = await encodeAndFormat(this.options.req, attachments);
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

    if (promptPrefix) {
      promptPrefix = `Instructions:\n${promptPrefix.trim()}`;
      instructions = {
        role: 'system',
        name: 'instructions',
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
    const useOldMethod = !!(invalidBaseUrl || !this.isChatCompletion || typeof Bun !== 'undefined');
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
    model = 'gpt-3.5-turbo',
    modelName,
    temperature = 0.2,
    presence_penalty = 0,
    frequency_penalty = 0,
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
      presence_penalty,
      frequency_penalty,
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

  async summarizeMessages({ messagesToRefine, remainingContextTokens }) {
    logger.debug('[OpenAIClient] Summarizing messages...');
    let context = messagesToRefine;
    let prompt;

    // TODO: remove the gpt fallback and make it specific to endpoint
    const { OPENAI_SUMMARY_MODEL = 'gpt-3.5-turbo' } = process.env ?? {};
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
      ({ context } = await this.getMessagesWithinTokenLimit(context, maxContextTokens));
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

  async recordTokenUsage({ promptTokens, completionTokens, context = 'message' }) {
    await spendTokens(
      {
        context,
        user: this.user,
        model: this.modelOptions.model,
        conversationId: this.conversationId,
        endpointTokenConfig: this.options.endpointTokenConfig,
      },
      { promptTokens, completionTokens },
    );
  }

  getTokenCountForResponse(response) {
    return this.getTokenCountForMessage({
      role: 'assistant',
      content: response.text,
    });
  }

  async chatCompletion({ payload, onProgress, abortController = null }) {
    let error = null;
    const errorCallback = (err) => (error = err);
    let intermediateReply = '';
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
      }

      if (this.azure || this.options.azure) {
        // Azure does not accept `model` in the body, so we need to remove it.
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

      if (process.env.OPENAI_ORGANIZATION) {
        opts.organization = process.env.OPENAI_ORGANIZATION;
      }

      let chatCompletion;
      /** @type {OpenAI} */
      const openai = new OpenAI({
        apiKey: this.apiKey,
        ...opts,
      });

      /* hacky fixes for Mistral AI API:
      - Re-orders system message to the top of the messages payload, as not allowed anywhere else
      - If there is only one message and it's a system message, change the role to user
      */
      if (opts.baseURL.includes('https://api.mistral.ai/v1') && modelOptions.messages) {
        const { messages } = modelOptions;

        const systemMessageIndex = messages.findIndex((msg) => msg.role === 'system');

        if (systemMessageIndex > 0) {
          const [systemMessage] = messages.splice(systemMessageIndex, 1);
          messages.unshift(systemMessage);
        }

        modelOptions.messages = messages;

        if (messages.length === 1 && messages[0].role === 'system') {
          modelOptions.messages[0].role = 'user';
        }
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

      let UnexpectedRoleError = false;
      if (modelOptions.stream) {
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
          .on('finalChatCompletion', (finalChatCompletion) => {
            const finalMessage = finalChatCompletion?.choices?.[0]?.message;
            if (finalMessage && finalMessage?.role !== 'assistant') {
              finalChatCompletion.choices[0].message.role = 'assistant';
            }

            if (finalMessage && !finalMessage?.content?.trim()) {
              finalChatCompletion.choices[0].message.content = intermediateReply;
            }
          })
          .on('finalMessage', (message) => {
            if (message?.role !== 'assistant') {
              stream.messages.push({ role: 'assistant', content: intermediateReply });
              UnexpectedRoleError = true;
            }
          });

        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || '';
          intermediateReply += token;
          onProgress(token);
          if (abortController.signal.aborted) {
            stream.controller.abort();
            break;
          }
        }

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

      const { message, finish_reason } = chatCompletion.choices[0];
      if (chatCompletion) {
        this.metadata = { finish_reason };
      }

      logger.debug('[OpenAIClient] chatCompletion response', chatCompletion);

      if (!message?.content?.trim() && intermediateReply.length) {
        logger.debug(
          '[OpenAIClient] chatCompletion: using intermediateReply due to empty message.content',
          { intermediateReply },
        );
        return intermediateReply;
      }

      return message.content;
    } catch (err) {
      if (
        err?.message?.includes('abort') ||
        (err instanceof OpenAI.APIError && err?.message?.includes('abort'))
      ) {
        return intermediateReply;
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
        return intermediateReply;
      } else if (err instanceof OpenAI.APIError) {
        if (intermediateReply) {
          return intermediateReply;
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
