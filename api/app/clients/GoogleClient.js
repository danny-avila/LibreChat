const { google } = require('googleapis');
const { concat } = require('@langchain/core/utils/stream');
const { ChatVertexAI } = require('@langchain/google-vertexai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { GoogleGenerativeAI: GenAI } = require('@google/generative-ai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const {
  googleGenConfigSchema,
  validateVisionModel,
  getResponseSender,
  endpointSettings,
  EModelEndpoint,
  VisionModes,
  ErrorTypes,
  Constants,
  AuthKeys,
} = require('librechat-data-provider');
const { encodeAndFormat } = require('~/server/services/Files/images');
const Tokenizer = require('~/server/services/Tokenizer');
const { spendTokens } = require('~/models/spendTokens');
const { getModelMaxTokens } = require('~/utils');
const { sleep } = require('~/server/utils');
const { logger } = require('~/config');
const {
  formatMessage,
  createContextHandlers,
  titleInstruction,
  truncateText,
} = require('./prompts');
const BaseClient = require('./BaseClient');

const loc = process.env.GOOGLE_LOC || 'us-central1';
const publisher = 'google';
const endpointPrefix = `${loc}-aiplatform.googleapis.com`;

const settings = endpointSettings[EModelEndpoint.google];
const EXCLUDED_GENAI_MODELS = /gemini-(?:1\.0|1-0|pro)/;

class GoogleClient extends BaseClient {
  constructor(credentials, options = {}) {
    super('apiKey', options);
    let creds = {};

    if (typeof credentials === 'string') {
      creds = JSON.parse(credentials);
    } else if (credentials) {
      creds = credentials;
    }

    const serviceKey = creds[AuthKeys.GOOGLE_SERVICE_KEY] ?? {};
    this.serviceKey =
      serviceKey && typeof serviceKey === 'string' ? JSON.parse(serviceKey) : serviceKey ?? {};
    /** @type {string | null | undefined} */
    this.project_id = this.serviceKey.project_id;
    this.client_email = this.serviceKey.client_email;
    this.private_key = this.serviceKey.private_key;
    this.access_token = null;

    this.apiKey = creds[AuthKeys.GOOGLE_API_KEY];

    this.reverseProxyUrl = options.reverseProxyUrl;

    this.authHeader = options.authHeader;

    /** @type {UsageMetadata | undefined} */
    this.usage;
    /** The key for the usage object's input tokens
     * @type {string} */
    this.inputTokensKey = 'input_tokens';
    /** The key for the usage object's output tokens
     * @type {string} */
    this.outputTokensKey = 'output_tokens';

    if (options.skipSetOptions) {
      return;
    }
    this.setOptions(options);
  }

  /* Google specific methods */
  constructUrl() {
    return `https://${endpointPrefix}/v1/projects/${this.project_id}/locations/${loc}/publishers/${publisher}/models/${this.modelOptions.model}:serverStreamingPredict`;
  }

  async getClient() {
    const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
    const jwtClient = new google.auth.JWT(this.client_email, null, this.private_key, scopes);

    jwtClient.authorize((err) => {
      if (err) {
        logger.error('jwtClient failed to authorize', err);
        throw err;
      }
    });

    return jwtClient;
  }

  async getAccessToken() {
    const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
    const jwtClient = new google.auth.JWT(this.client_email, null, this.private_key, scopes);

    return new Promise((resolve, reject) => {
      jwtClient.authorize((err, tokens) => {
        if (err) {
          logger.error('jwtClient failed to authorize', err);
          reject(err);
        } else {
          resolve(tokens.access_token);
        }
      });
    });
  }

  /* Required Client methods */
  setOptions(options) {
    if (this.options && !this.options.replaceOptions) {
      // nested options aren't spread properly, so we need to do this manually
      this.options.modelOptions = {
        ...this.options.modelOptions,
        ...options.modelOptions,
      };
      delete options.modelOptions;
      // now we can merge options
      this.options = {
        ...this.options,
        ...options,
      };
    } else {
      this.options = options;
    }

    this.modelOptions = this.options.modelOptions || {};

    this.options.attachments?.then((attachments) => this.checkVisionRequest(attachments));

    /** @type {boolean} Whether using a "GenerativeAI" Model */
    this.isGenerativeModel =
      this.modelOptions.model.includes('gemini') || this.modelOptions.model.includes('learnlm');

    this.maxContextTokens =
      this.options.maxContextTokens ??
      getModelMaxTokens(this.modelOptions.model, EModelEndpoint.google);

    // The max prompt tokens is determined by the max context tokens minus the max response tokens.
    // Earlier messages will be dropped until the prompt is within the limit.
    this.maxResponseTokens = this.modelOptions.maxOutputTokens || settings.maxOutputTokens.default;

    if (this.maxContextTokens > 32000) {
      this.maxContextTokens = this.maxContextTokens - this.maxResponseTokens;
    }

    this.maxPromptTokens =
      this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + maxOutputTokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`,
      );
    }

    this.sender =
      this.options.sender ??
      getResponseSender({
        model: this.modelOptions.model,
        endpoint: EModelEndpoint.google,
        modelLabel: this.options.modelLabel,
      });

    this.userLabel = this.options.userLabel || 'User';
    this.modelLabel = this.options.modelLabel || 'Assistant';

    if (this.options.reverseProxyUrl) {
      this.completionsUrl = this.options.reverseProxyUrl;
    } else {
      this.completionsUrl = this.constructUrl();
    }

    let promptPrefix = (this.options.promptPrefix ?? '').trim();
    if (typeof this.options.artifactsPrompt === 'string' && this.options.artifactsPrompt) {
      promptPrefix = `${promptPrefix ?? ''}\n${this.options.artifactsPrompt}`.trim();
    }
    this.options.promptPrefix = promptPrefix;
    this.initializeClient();
    return this;
  }

  /**
   *
   * Checks if the model is a vision model based on request attachments and sets the appropriate options:
   * @param {MongoFile[]} attachments
   */
  checkVisionRequest(attachments) {
    /* Validation vision request */
    this.defaultVisionModel = this.options.visionModel ?? 'gemini-pro-vision';
    const availableModels = this.options.modelsConfig?.[EModelEndpoint.google];
    this.isVisionModel = validateVisionModel({ model: this.modelOptions.model, availableModels });

    if (
      attachments &&
      attachments.some((file) => file?.type && file?.type?.includes('image')) &&
      availableModels?.includes(this.defaultVisionModel) &&
      !this.isVisionModel
    ) {
      this.modelOptions.model = this.defaultVisionModel;
      this.isVisionModel = true;
    }

    if (this.isVisionModel && !attachments && this.modelOptions.model.includes('gemini-pro')) {
      this.modelOptions.model = 'gemini-pro';
      this.isVisionModel = false;
    }
  }

  formatMessages() {
    return ((message) => ({
      author: message?.author ?? (message.isCreatedByUser ? this.userLabel : this.modelLabel),
      content: message?.content ?? message.text,
    })).bind(this);
  }

  /**
   * Formats messages for generative AI
   * @param {TMessage[]} messages
   * @returns
   */
  async formatGenerativeMessages(messages) {
    const formattedMessages = [];
    const attachments = await this.options.attachments;
    const latestMessage = { ...messages[messages.length - 1] };
    const files = await this.addImageURLs(latestMessage, attachments, VisionModes.generative);
    this.options.attachments = files;
    messages[messages.length - 1] = latestMessage;

    for (const _message of messages) {
      const role = _message.isCreatedByUser ? this.userLabel : this.modelLabel;
      const parts = [];
      parts.push({ text: _message.text });
      if (!_message.image_urls?.length) {
        formattedMessages.push({ role, parts });
        continue;
      }

      for (const images of _message.image_urls) {
        if (images.inlineData) {
          parts.push({ inlineData: images.inlineData });
        }
      }

      formattedMessages.push({ role, parts });
    }

    return formattedMessages;
  }

  /**
   *
   * Adds image URLs to the message object and returns the files
   *
   * @param {TMessage[]} messages
   * @param {MongoFile[]} files
   * @returns {Promise<MongoFile[]>}
   */
  async addImageURLs(message, attachments, mode = '') {
    const { files, image_urls } = await encodeAndFormat(
      this.options.req,
      attachments,
      EModelEndpoint.google,
      mode,
    );
    message.image_urls = image_urls.length ? image_urls : undefined;
    return files;
  }

  /**
   * Builds the augmented prompt for attachments
   * TODO: Add File API Support
   * @param {TMessage[]} messages
   */
  async buildAugmentedPrompt(messages = []) {
    const attachments = await this.options.attachments;
    const latestMessage = { ...messages[messages.length - 1] };
    this.contextHandlers = createContextHandlers(this.options.req, latestMessage.text);

    if (this.contextHandlers) {
      for (const file of attachments) {
        if (file.embedded) {
          this.contextHandlers?.processFile(file);
          continue;
        }
      }

      this.augmentedPrompt = await this.contextHandlers.createContext();
      this.options.promptPrefix = this.augmentedPrompt + this.options.promptPrefix;
    }
  }

  async buildVisionMessages(messages = [], parentMessageId) {
    const attachments = await this.options.attachments;
    const latestMessage = { ...messages[messages.length - 1] };
    await this.buildAugmentedPrompt(messages);

    const { prompt } = await this.buildMessagesPrompt(messages, parentMessageId);

    const files = await this.addImageURLs(latestMessage, attachments);

    this.options.attachments = files;

    latestMessage.text = prompt;

    const payload = {
      instances: [
        {
          messages: [new HumanMessage(formatMessage({ message: latestMessage }))],
        },
      ],
    };
    return { prompt: payload };
  }

  /** @param {TMessage[]} [messages=[]]  */
  async buildGenerativeMessages(messages = []) {
    this.userLabel = 'user';
    this.modelLabel = 'model';
    const promises = [];
    promises.push(await this.formatGenerativeMessages(messages));
    promises.push(this.buildAugmentedPrompt(messages));
    const [formattedMessages] = await Promise.all(promises);
    return { prompt: formattedMessages };
  }

  /**
   * @param {TMessage[]} [messages=[]]
   * @param {string} [parentMessageId]
   */
  async buildMessages(_messages = [], parentMessageId) {
    if (!this.isGenerativeModel && !this.project_id) {
      throw new Error('[GoogleClient] PaLM 2 and Codey models are no longer supported.');
    }

    if (this.options.promptPrefix) {
      const instructionsTokenCount = this.getTokenCount(this.options.promptPrefix);

      this.maxContextTokens = this.maxContextTokens - instructionsTokenCount;
      if (this.maxContextTokens < 0) {
        const info = `${instructionsTokenCount} / ${this.maxContextTokens}`;
        const errorMessage = `{ "type": "${ErrorTypes.INPUT_LENGTH}", "info": "${info}" }`;
        logger.warn(`Instructions token count exceeds max context (${info}).`);
        throw new Error(errorMessage);
      }
    }

    for (let i = 0; i < _messages.length; i++) {
      const message = _messages[i];
      if (!message.tokenCount) {
        _messages[i].tokenCount = this.getTokenCountForMessage({
          role: message.isCreatedByUser ? 'user' : 'assistant',
          content: message.content ?? message.text,
        });
      }
    }

    const {
      payload: messages,
      tokenCountMap,
      promptTokens,
    } = await this.handleContextStrategy({
      orderedMessages: _messages,
      formattedMessages: _messages,
    });

    if (!this.project_id && !EXCLUDED_GENAI_MODELS.test(this.modelOptions.model)) {
      const result = await this.buildGenerativeMessages(messages);
      result.tokenCountMap = tokenCountMap;
      result.promptTokens = promptTokens;
      return result;
    }

    if (this.options.attachments && this.isGenerativeModel) {
      const result = this.buildVisionMessages(messages, parentMessageId);
      result.tokenCountMap = tokenCountMap;
      result.promptTokens = promptTokens;
      return result;
    }

    let payload = {
      instances: [
        {
          messages: messages
            .map(this.formatMessages())
            .map((msg) => ({ ...msg, role: msg.author === 'User' ? 'user' : 'assistant' }))
            .map((message) => formatMessage({ message, langChain: true })),
        },
      ],
    };

    if (this.options.promptPrefix) {
      payload.instances[0].context = this.options.promptPrefix;
    }

    logger.debug('[GoogleClient] buildMessages', payload);
    return { prompt: payload, tokenCountMap, promptTokens };
  }

  async buildMessagesPrompt(messages, parentMessageId) {
    const orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
    });

    logger.debug('[GoogleClient]', {
      orderedMessages,
      parentMessageId,
    });

    const formattedMessages = orderedMessages.map(this.formatMessages());

    let lastAuthor = '';
    let groupedMessages = [];

    for (let message of formattedMessages) {
      // If last author is not same as current author, add to new group
      if (lastAuthor !== message.author) {
        groupedMessages.push({
          author: message.author,
          content: [message.content],
        });
        lastAuthor = message.author;
        // If same author, append content to the last group
      } else {
        groupedMessages[groupedMessages.length - 1].content.push(message.content);
      }
    }

    let identityPrefix = '';
    if (this.options.userLabel) {
      identityPrefix = `\nHuman's name: ${this.options.userLabel}`;
    }

    if (this.options.modelLabel) {
      identityPrefix = `${identityPrefix}\nYou are ${this.options.modelLabel}`;
    }

    let promptPrefix = (this.options.promptPrefix ?? '').trim();

    if (identityPrefix) {
      promptPrefix = `${identityPrefix}${promptPrefix}`;
    }

    // Prompt AI to respond, empty if last message was from AI
    let isEdited = lastAuthor === this.modelLabel;
    const promptSuffix = isEdited ? '' : `${promptPrefix}\n\n${this.modelLabel}:\n`;
    let currentTokenCount = isEdited
      ? this.getTokenCount(promptPrefix)
      : this.getTokenCount(promptSuffix);

    let promptBody = '';
    const maxTokenCount = this.maxPromptTokens;

    const context = [];

    // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    // Do this within a recursive async function so that it doesn't block the event loop for too long.
    // Also, remove the next message when the message that puts us over the token limit is created by the user.
    // Otherwise, remove only the exceeding message. This is due to Anthropic's strict payload rule to start with "Human:".
    const nextMessage = {
      remove: false,
      tokenCount: 0,
      messageString: '',
    };

    const buildPromptBody = async () => {
      if (currentTokenCount < maxTokenCount && groupedMessages.length > 0) {
        const message = groupedMessages.pop();
        const isCreatedByUser = message.author === this.userLabel;
        // Use promptPrefix if message is edited assistant'
        const messagePrefix =
          isCreatedByUser || !isEdited
            ? `\n\n${message.author}:`
            : `${promptPrefix}\n\n${message.author}:`;
        const messageString = `${messagePrefix}\n${message.content}\n`;
        let newPromptBody = `${messageString}${promptBody}`;

        context.unshift(message);

        const tokenCountForMessage = this.getTokenCount(messageString);
        const newTokenCount = currentTokenCount + tokenCountForMessage;

        if (!isCreatedByUser) {
          nextMessage.messageString = messageString;
          nextMessage.tokenCount = tokenCountForMessage;
        }

        if (newTokenCount > maxTokenCount) {
          if (!promptBody) {
            // This is the first message, so we can't add it. Just throw an error.
            throw new Error(
              `Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`,
            );
          }

          // Otherwise, ths message would put us over the token limit, so don't add it.
          // if created by user, remove next message, otherwise remove only this message
          if (isCreatedByUser) {
            nextMessage.remove = true;
          }

          return false;
        }
        promptBody = newPromptBody;
        currentTokenCount = newTokenCount;

        // Switch off isEdited after using it for the first time
        if (isEdited) {
          isEdited = false;
        }

        // wait for next tick to avoid blocking the event loop
        await new Promise((resolve) => setImmediate(resolve));
        return buildPromptBody();
      }
      return true;
    };

    await buildPromptBody();

    if (nextMessage.remove) {
      promptBody = promptBody.replace(nextMessage.messageString, '');
      currentTokenCount -= nextMessage.tokenCount;
      context.shift();
    }

    let prompt = `${promptBody}${promptSuffix}`.trim();

    // Add 2 tokens for metadata after all messages have been counted.
    currentTokenCount += 2;

    // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    this.modelOptions.maxOutputTokens = Math.min(
      this.maxContextTokens - currentTokenCount,
      this.maxResponseTokens,
    );

    return { prompt, context };
  }

  createLLM(clientOptions) {
    const model = clientOptions.modelName ?? clientOptions.model;
    clientOptions.location = loc;
    clientOptions.endpoint = endpointPrefix;

    let requestOptions = null;
    if (this.reverseProxyUrl) {
      requestOptions = {
        baseUrl: this.reverseProxyUrl,
      };

      if (this.authHeader) {
        requestOptions.customHeaders = {
          Authorization: `Bearer ${this.apiKey}`,
        };
      }
    }

    if (this.project_id != null) {
      logger.debug('Creating VertexAI client');
      return new ChatVertexAI(clientOptions);
    } else if (!EXCLUDED_GENAI_MODELS.test(model)) {
      logger.debug('Creating GenAI client');
      return new GenAI(this.apiKey).getGenerativeModel({ model }, requestOptions);
    }

    logger.debug('Creating Chat Google Generative AI client');
    return new ChatGoogleGenerativeAI({ ...clientOptions, apiKey: this.apiKey });
  }

  initializeClient() {
    let clientOptions = { ...this.modelOptions, maxRetries: 2 };

    if (this.project_id) {
      clientOptions['authOptions'] = {
        credentials: {
          ...this.serviceKey,
        },
        projectId: this.project_id,
      };
    }

    if (this.isGenerativeModel && !this.project_id) {
      clientOptions.modelName = clientOptions.model;
      delete clientOptions.model;
    }

    this.client = this.createLLM(clientOptions);
    return this.client;
  }

  async getCompletion(_payload, options = {}) {
    const safetySettings = this.getSafetySettings();
    const { onProgress, abortController } = options;
    const streamRate = this.options.streamRate ?? Constants.DEFAULT_STREAM_RATE;
    const modelName = this.modelOptions.modelName ?? this.modelOptions.model ?? '';

    let reply = '';

    try {
      if (!EXCLUDED_GENAI_MODELS.test(modelName) && !this.project_id) {
        /** @type {GenAI} */
        const client = this.client;
        /** @type {GenerateContentRequest} */
        const requestOptions = {
          safetySettings,
          contents: _payload,
          generationConfig: googleGenConfigSchema.parse(this.modelOptions),
        };

        const promptPrefix = (this.options.promptPrefix ?? '').trim();
        if (promptPrefix.length) {
          requestOptions.systemInstruction = {
            parts: [
              {
                text: promptPrefix,
              },
            ],
          };
        }

        const delay = modelName.includes('flash') ? 8 : 15;
        /** @type {GenAIUsageMetadata} */
        let usageMetadata;

        const result = await client.generateContentStream(requestOptions);
        for await (const chunk of result.stream) {
          usageMetadata = !usageMetadata
            ? chunk?.usageMetadata
            : Object.assign(usageMetadata, chunk?.usageMetadata);
          const chunkText = chunk.text();
          await this.generateTextStream(chunkText, onProgress, {
            delay,
          });
          reply += chunkText;
          await sleep(streamRate);
        }

        if (usageMetadata) {
          this.usage = {
            input_tokens: usageMetadata.promptTokenCount,
            output_tokens: usageMetadata.candidatesTokenCount,
          };
        }

        return reply;
      }

      const { instances } = _payload;
      const { messages: messages, context } = instances?.[0] ?? {};

      if (!this.isVisionModel && context && messages?.length > 0) {
        messages.unshift(new SystemMessage(context));
      }

      /** @type {import('@langchain/core/messages').AIMessageChunk['usage_metadata']} */
      let usageMetadata;
      const stream = await this.client.stream(messages, {
        signal: abortController.signal,
        streamUsage: true,
        safetySettings,
      });

      let delay = this.options.streamRate || 8;

      if (!this.options.streamRate) {
        if (this.isGenerativeModel) {
          delay = 15;
        }
        if (modelName.includes('flash')) {
          delay = 5;
        }
      }

      for await (const chunk of stream) {
        usageMetadata = !usageMetadata
          ? chunk?.usage_metadata
          : concat(usageMetadata, chunk?.usage_metadata);
        const chunkText = chunk?.content ?? chunk;
        await this.generateTextStream(chunkText, onProgress, {
          delay,
        });
        reply += chunkText;
      }

      if (usageMetadata) {
        this.usage = usageMetadata;
      }
    } catch (e) {
      logger.error('[GoogleClient] There was an issue generating the completion', e);
    }
    return reply;
  }

  /**
   * Get stream usage as returned by this client's API response.
   * @returns {UsageMetadata} The stream usage object.
   */
  getStreamUsage() {
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
   * @param {UsageMetadata} params.usage - The usage object returned by the API.
   * @returns {number} The correct token count for the current user message.
   */
  calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage }) {
    const originalEstimate = tokenCountMap[currentMessageId] || 0;

    if (!usage || typeof usage.input_tokens !== 'number') {
      return originalEstimate;
    }

    tokenCountMap[currentMessageId] = 0;
    const totalTokensFromMap = Object.values(tokenCountMap).reduce((sum, count) => {
      const numCount = Number(count);
      return sum + (isNaN(numCount) ? 0 : numCount);
    }, 0);
    const totalInputTokens = usage.input_tokens ?? 0;
    const currentMessageTokens = totalInputTokens - totalTokensFromMap;
    return currentMessageTokens > 0 ? currentMessageTokens : originalEstimate;
  }

  /**
   * @param {object} params
   * @param {number} params.promptTokens
   * @param {number} params.completionTokens
   * @param {UsageMetadata} [params.usage]
   * @param {string} [params.model]
   * @param {string} [params.context='message']
   * @returns {Promise<void>}
   */
  async recordTokenUsage({ promptTokens, completionTokens, model, context = 'message' }) {
    await spendTokens(
      {
        context,
        user: this.user ?? this.options.req?.user?.id,
        conversationId: this.conversationId,
        model: model ?? this.modelOptions.model,
        endpointTokenConfig: this.options.endpointTokenConfig,
      },
      { promptTokens, completionTokens },
    );
  }

  /**
   * Stripped-down logic for generating a title. This uses the non-streaming APIs, since the user does not see titles streaming
   */
  async titleChatCompletion(_payload, options = {}) {
    const { abortController } = options;
    const safetySettings = this.getSafetySettings();

    let reply = '';

    const model = this.modelOptions.modelName ?? this.modelOptions.model ?? '';
    if (!EXCLUDED_GENAI_MODELS.test(model) && !this.project_id) {
      logger.debug('Identified titling model as GenAI version');
      /** @type {GenerativeModel} */
      const client = this.client;
      const requestOptions = {
        contents: _payload,
        safetySettings,
        generationConfig: {
          temperature: 0.5,
        },
      };

      const result = await client.generateContent(requestOptions);
      reply = result.response?.text();
      return reply;
    } else {
      const { instances } = _payload;
      const { messages } = instances?.[0] ?? {};
      const titleResponse = await this.client.invoke(messages, {
        signal: abortController.signal,
        timeout: 7000,
        safetySettings,
      });

      if (titleResponse.usage_metadata) {
        await this.recordTokenUsage({
          model,
          promptTokens: titleResponse.usage_metadata.input_tokens,
          completionTokens: titleResponse.usage_metadata.output_tokens,
          context: 'title',
        });
      }

      reply = titleResponse.content;
      return reply;
    }
  }

  async titleConvo({ text, responseText = '' }) {
    let title = 'New Chat';
    const convo = `||>User:
"${truncateText(text)}"
||>Response:
"${JSON.stringify(truncateText(responseText))}"`;

    let { prompt: payload } = await this.buildMessages([
      {
        text: `Please generate ${titleInstruction}

    ${convo}
    
    ||>Title:`,
        isCreatedByUser: true,
        author: this.userLabel,
      },
    ]);

    const model = process.env.GOOGLE_TITLE_MODEL ?? this.modelOptions.model;
    const availableModels = this.options.modelsConfig?.[EModelEndpoint.google];
    this.isVisionModel = validateVisionModel({ model, availableModels });

    if (this.isVisionModel) {
      logger.warn(
        `Current vision model does not support titling without an attachment; falling back to default model ${settings.model.default}`,
      );
      this.modelOptions.model = settings.model.default;
    }

    try {
      this.initializeClient();
      title = await this.titleChatCompletion(payload, {
        abortController: new AbortController(),
        onProgress: () => {},
      });
    } catch (e) {
      logger.error('[GoogleClient] There was an issue generating the title', e);
    }
    logger.debug(`Title response: ${title}`);
    return title;
  }

  getSaveOptions() {
    return {
      endpointType: null,
      artifacts: this.options.artifacts,
      promptPrefix: this.options.promptPrefix,
      maxContextTokens: this.options.maxContextTokens,
      modelLabel: this.options.modelLabel,
      iconURL: this.options.iconURL,
      greeting: this.options.greeting,
      spec: this.options.spec,
      ...this.modelOptions,
    };
  }

  getBuildMessagesOptions() {
    // logger.debug('GoogleClient doesn\'t use getBuildMessagesOptions');
  }

  async sendCompletion(payload, opts = {}) {
    let reply = '';
    reply = await this.getCompletion(payload, opts);
    return reply.trim();
  }

  getSafetySettings() {
    const model = this.modelOptions.model;
    const isGemini2 = model.includes('gemini-2.0') && !model.includes('thinking');
    const mapThreshold = (value) => {
      if (isGemini2 && value === 'BLOCK_NONE') {
        return 'OFF';
      }
      return value;
    };

    return [
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: mapThreshold(
          process.env.GOOGLE_SAFETY_SEXUALLY_EXPLICIT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
        ),
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: mapThreshold(
          process.env.GOOGLE_SAFETY_HATE_SPEECH || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
        ),
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: mapThreshold(
          process.env.GOOGLE_SAFETY_HARASSMENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
        ),
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: mapThreshold(
          process.env.GOOGLE_SAFETY_DANGEROUS_CONTENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
        ),
      },
      {
        category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
        threshold: mapThreshold(process.env.GOOGLE_SAFETY_CIVIC_INTEGRITY || 'BLOCK_NONE'),
      },
    ];
  }

  getEncoding() {
    return 'cl100k_base';
  }

  async getVertexTokenCount(text) {
    /** @type {ChatVertexAI} */
    const client = this.client ?? this.initializeClient();
    const connection = client.connection;
    const gAuthClient = connection.client;
    const tokenEndpoint = `https://${connection._endpoint}/${connection.apiVersion}/projects/${this.project_id}/locations/${connection._location}/publishers/google/models/${connection.model}/:countTokens`;
    const result = await gAuthClient.request({
      url: tokenEndpoint,
      method: 'POST',
      data: {
        contents: [{ role: 'user', parts: [{ text }] }],
      },
    });
    return result;
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

module.exports = GoogleClient;
