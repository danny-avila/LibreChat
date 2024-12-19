const { google } = require('googleapis');
const { Agent, ProxyAgent } = require('undici');
const { ChatVertexAI } = require('@langchain/google-vertexai');
const { GoogleVertexAI } = require('@langchain/google-vertexai');
const { ChatGoogleVertexAI } = require('@langchain/google-vertexai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { GoogleGenerativeAI: GenAI } = require('@google/generative-ai');
const { AIMessage, HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('tiktoken');
const {
  validateVisionModel,
  getResponseSender,
  endpointSettings,
  EModelEndpoint,
  VisionModes,
  Constants,
  AuthKeys,
} = require('librechat-data-provider');
const { encodeAndFormat } = require('~/server/services/Files/images');
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
const tokenizersCache = {};

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
    this.client_email = this.serviceKey.client_email;
    this.private_key = this.serviceKey.private_key;
    this.project_id = this.serviceKey.project_id;
    this.access_token = null;

    this.apiKey = creds[AuthKeys.GOOGLE_API_KEY];

    this.reverseProxyUrl = options.reverseProxyUrl;

    this.authHeader = options.authHeader;

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

    this.options.examples = (this.options.examples ?? [])
      .filter((ex) => ex)
      .filter((obj) => obj.input.content !== '' && obj.output.content !== '');

    this.modelOptions = this.options.modelOptions || {};

    this.options.attachments?.then((attachments) => this.checkVisionRequest(attachments));

    /** @type {boolean} Whether using a "GenerativeAI" Model */
    this.isGenerativeModel = this.modelOptions.model.includes('gemini');
    const { isGenerativeModel } = this;
    this.isChatModel = !isGenerativeModel && this.modelOptions.model.includes('chat');
    const { isChatModel } = this;
    this.isTextModel =
      !isGenerativeModel && !isChatModel && /code|text/.test(this.modelOptions.model);
    const { isTextModel } = this;

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

    if (isChatModel || isGenerativeModel) {
      // Use these faux tokens to help the AI understand the context since we are building the chat log ourselves.
      // Trying to use "<|im_start|>" causes the AI to still generate "<" or "<|" at the end sometimes for some reason,
      // without tripping the stop sequences, so I'm using "||>" instead.
      this.startToken = '||>';
      this.endToken = '';
      this.gptEncoder = this.constructor.getTokenizer('cl100k_base');
    } else if (isTextModel) {
      this.startToken = '||>';
      this.endToken = '';
      this.gptEncoder = this.constructor.getTokenizer('text-davinci-003', true, {
        '<|im_start|>': 100264,
        '<|im_end|>': 100265,
      });
    } else {
      // Previously I was trying to use "<|endoftext|>" but there seems to be some bug with OpenAI's token counting
      // system that causes only the first "<|endoftext|>" to be counted as 1 token, and the rest are not treated
      // as a single token. So we're using this instead.
      this.startToken = '||>';
      this.endToken = '';
      try {
        this.gptEncoder = this.constructor.getTokenizer(this.modelOptions.model, true);
      } catch {
        this.gptEncoder = this.constructor.getTokenizer('text-davinci-003', true);
      }
    }

    if (!this.modelOptions.stop) {
      const stopTokens = [this.startToken];
      if (this.endToken && this.endToken !== this.startToken) {
        stopTokens.push(this.endToken);
      }
      stopTokens.push(`\n${this.userLabel}:`);
      stopTokens.push('<|diff_marker|>');
      // I chose not to do one for `modelLabel` because I've never seen it happen
      this.modelOptions.stop = stopTokens;
    }

    if (this.options.reverseProxyUrl) {
      this.completionsUrl = this.options.reverseProxyUrl;
    } else {
      this.completionsUrl = this.constructUrl();
    }

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
      parameters: this.modelOptions,
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

  async buildMessages(messages = [], parentMessageId) {
    if (!this.isGenerativeModel && !this.project_id) {
      throw new Error(
        '[GoogleClient] a Service Account JSON Key is required for PaLM 2 and Codey models (Vertex AI)',
      );
    }

    if (!this.project_id && !EXCLUDED_GENAI_MODELS.test(this.modelOptions.model)) {
      return await this.buildGenerativeMessages(messages);
    }

    if (this.options.attachments && this.isGenerativeModel) {
      return this.buildVisionMessages(messages, parentMessageId);
    }

    if (this.isTextModel) {
      return this.buildMessagesPrompt(messages, parentMessageId);
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
      parameters: this.modelOptions,
    };

    let promptPrefix = (this.options.promptPrefix ?? '').trim();
    if (typeof this.options.artifactsPrompt === 'string' && this.options.artifactsPrompt) {
      promptPrefix = `${promptPrefix ?? ''}\n${this.options.artifactsPrompt}`.trim();
    }

    if (promptPrefix) {
      payload.instances[0].context = promptPrefix;
    }

    if (this.options.examples.length > 0) {
      payload.instances[0].examples = this.options.examples;
    }

    logger.debug('[GoogleClient] buildMessages', payload);

    return { prompt: payload };
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

    const formattedMessages = orderedMessages.map((message) => ({
      author: message.isCreatedByUser ? this.userLabel : this.modelLabel,
      content: message?.content ?? message.text,
    }));

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
    if (typeof this.options.artifactsPrompt === 'string' && this.options.artifactsPrompt) {
      promptPrefix = `${promptPrefix ?? ''}\n${this.options.artifactsPrompt}`.trim();
    }
    if (promptPrefix) {
      // If the prompt prefix doesn't end with the end token, add it.
      if (!promptPrefix.endsWith(`${this.endToken}`)) {
        promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
      }
      promptPrefix = `\nContext:\n${promptPrefix}`;
    }

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
        const messageString = `${messagePrefix}\n${message.content}${this.endToken}\n`;
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

  async _getCompletion(payload, abortController = null) {
    if (!abortController) {
      abortController = new AbortController();
    }
    const { debug } = this.options;
    const url = this.completionsUrl;
    if (debug) {
      logger.debug('GoogleClient _getCompletion', { url, payload });
    }
    const opts = {
      method: 'POST',
      agent: new Agent({
        bodyTimeout: 0,
        headersTimeout: 0,
      }),
      signal: abortController.signal,
    };

    if (this.options.proxy) {
      opts.agent = new ProxyAgent(this.options.proxy);
    }

    const client = await this.getClient();
    const res = await client.request({ url, method: 'POST', data: payload });
    logger.debug('GoogleClient _getCompletion', { res });
    return res.data;
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

    if (this.project_id && this.isTextModel) {
      logger.debug('Creating Google VertexAI client');
      return new GoogleVertexAI(clientOptions);
    } else if (this.project_id && this.isChatModel) {
      logger.debug('Creating Chat Google VertexAI client');
      return new ChatGoogleVertexAI(clientOptions);
    } else if (this.project_id) {
      logger.debug('Creating VertexAI client');
      return new ChatVertexAI(clientOptions);
    } else if (!EXCLUDED_GENAI_MODELS.test(model)) {
      logger.debug('Creating GenAI client');
      return new GenAI(this.apiKey).getGenerativeModel({ ...clientOptions, model }, requestOptions);
    }

    logger.debug('Creating Chat Google Generative AI client');
    return new ChatGoogleGenerativeAI({ ...clientOptions, apiKey: this.apiKey });
  }

  async getCompletion(_payload, options = {}) {
    const { parameters, instances } = _payload;
    const { onProgress, abortController } = options;
    const streamRate = this.options.streamRate ?? Constants.DEFAULT_STREAM_RATE;
    const { messages: _messages, context, examples: _examples } = instances?.[0] ?? {};

    let examples;

    let clientOptions = { ...parameters, maxRetries: 2 };

    if (this.project_id) {
      clientOptions['authOptions'] = {
        credentials: {
          ...this.serviceKey,
        },
        projectId: this.project_id,
      };
    }

    if (!parameters) {
      clientOptions = { ...clientOptions, ...this.modelOptions };
    }

    if (this.isGenerativeModel && !this.project_id) {
      clientOptions.modelName = clientOptions.model;
      delete clientOptions.model;
    }

    if (_examples && _examples.length) {
      examples = _examples
        .map((ex) => {
          const { input, output } = ex;
          if (!input || !output) {
            return undefined;
          }
          return {
            input: new HumanMessage(input.content),
            output: new AIMessage(output.content),
          };
        })
        .filter((ex) => ex);

      clientOptions.examples = examples;
    }

    const model = this.createLLM(clientOptions);

    let reply = '';
    const messages = this.isTextModel ? _payload.trim() : _messages;

    if (!this.isVisionModel && context && messages?.length > 0) {
      messages.unshift(new SystemMessage(context));
    }

    const modelName = clientOptions.modelName ?? clientOptions.model ?? '';
    if (!EXCLUDED_GENAI_MODELS.test(modelName) && !this.project_id) {
      const client = model;
      const requestOptions = {
        contents: _payload,
      };

      let promptPrefix = (this.options.promptPrefix ?? '').trim();
      if (typeof this.options.artifactsPrompt === 'string' && this.options.artifactsPrompt) {
        promptPrefix = `${promptPrefix ?? ''}\n${this.options.artifactsPrompt}`.trim();
      }

      if (promptPrefix.length) {
        requestOptions.systemInstruction = {
          parts: [
            {
              text: promptPrefix,
            },
          ],
        };
      }

      requestOptions.safetySettings = _payload.safetySettings;

      const delay = modelName.includes('flash') ? 8 : 15;
      const result = await client.generateContentStream(requestOptions);
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        await this.generateTextStream(chunkText, onProgress, {
          delay,
        });
        reply += chunkText;
        await sleep(streamRate);
      }
      return reply;
    }

    const stream = await model.stream(messages, {
      signal: abortController.signal,
      safetySettings: _payload.safetySettings,
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
      const chunkText = chunk?.content ?? chunk;
      await this.generateTextStream(chunkText, onProgress, {
        delay,
      });
      reply += chunkText;
    }

    return reply;
  }

  /**
   * Stripped-down logic for generating a title. This uses the non-streaming APIs, since the user does not see titles streaming
   */
  async titleChatCompletion(_payload, options = {}) {
    const { abortController } = options;
    const { parameters, instances } = _payload;
    const { messages: _messages, examples: _examples } = instances?.[0] ?? {};

    let clientOptions = { ...parameters, maxRetries: 2 };

    logger.debug('Initialized title client options');

    if (this.project_id) {
      clientOptions['authOptions'] = {
        credentials: {
          ...this.serviceKey,
        },
        projectId: this.project_id,
      };
    }

    if (!parameters) {
      clientOptions = { ...clientOptions, ...this.modelOptions };
    }

    if (this.isGenerativeModel && !this.project_id) {
      clientOptions.modelName = clientOptions.model;
      delete clientOptions.model;
    }

    const model = this.createLLM(clientOptions);

    let reply = '';
    const messages = this.isTextModel ? _payload.trim() : _messages;

    const modelName = clientOptions.modelName ?? clientOptions.model ?? '';
    if (!EXCLUDED_GENAI_MODELS.test(modelName) && !this.project_id) {
      logger.debug('Identified titling model as GenAI version');
      /** @type {GenerativeModel} */
      const client = model;
      const requestOptions = {
        contents: _payload,
      };

      let promptPrefix = (this.options.promptPrefix ?? '').trim();
      if (typeof this.options.artifactsPrompt === 'string' && this.options.artifactsPrompt) {
        promptPrefix = `${promptPrefix ?? ''}\n${this.options.artifactsPrompt}`.trim();
      }

      if (this.options?.promptPrefix?.length) {
        requestOptions.systemInstruction = {
          parts: [
            {
              text: promptPrefix,
            },
          ],
        };
      }

      const safetySettings = _payload.safetySettings;
      requestOptions.safetySettings = safetySettings;

      const result = await client.generateContent(requestOptions);

      reply = result.response?.text();

      return reply;
    } else {
      logger.debug('Beginning titling');
      const safetySettings = _payload.safetySettings;

      const titleResponse = await model.invoke(messages, {
        signal: abortController.signal,
        timeout: 7000,
        safetySettings: safetySettings,
      });

      reply = titleResponse.content;
      // TODO: RECORD TOKEN USAGE
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

    if (this.isVisionModel) {
      logger.warn(
        `Current vision model does not support titling without an attachment; falling back to default model ${settings.model.default}`,
      );

      payload.parameters = { ...payload.parameters, model: settings.model.default };
    }

    try {
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
      artifacts: this.options.artifacts,
      promptPrefix: this.options.promptPrefix,
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
    payload.safetySettings = this.getSafetySettings();

    let reply = '';
    reply = await this.getCompletion(payload, opts);
    return reply.trim();
  }

  getSafetySettings() {
    return [
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold:
          process.env.GOOGLE_SAFETY_SEXUALLY_EXPLICIT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: process.env.GOOGLE_SAFETY_HATE_SPEECH || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: process.env.GOOGLE_SAFETY_HARASSMENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold:
          process.env.GOOGLE_SAFETY_DANGEROUS_CONTENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      },
      {
        category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
        threshold: process.env.GOOGLE_SAFETY_CIVIC_INTEGRITY || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      },
    ];
  }

  /* TO-DO: Handle tokens with Google tokenization NOTE: these are required */
  static getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
    if (tokenizersCache[encoding]) {
      return tokenizersCache[encoding];
    }
    let tokenizer;
    if (isModelName) {
      tokenizer = encodingForModel(encoding, extendSpecialTokens);
    } else {
      tokenizer = getEncoding(encoding, extendSpecialTokens);
    }
    tokenizersCache[encoding] = tokenizer;
    return tokenizer;
  }

  getTokenCount(text) {
    return this.gptEncoder.encode(text, 'all').length;
  }
}

module.exports = GoogleClient;
