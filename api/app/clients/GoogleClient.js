const { google } = require('googleapis');
const { Tokenizer } = require('@librechat/api');
const { z } = require('zod');

// Schema for the analysis output from the first LLM call
const AnalysisSchema = z.object({
  intent: z.string().describe("The main intent or purpose of the user's message"),
  context: z.object({
    domain: z.string().optional().describe("The domain or subject area of the query"),
    complexity: z.union([
      z.string().transform(val => {
        const lowerVal = val.toLowerCase();
        if (lowerVal.includes('beginner')) return 'beginner';
        if (lowerVal.includes('advanced')) return 'advanced';
        return 'intermediate';
      }),
      z.enum(['beginner', 'intermediate', 'advanced'])
    ]).default('intermediate'),
    requires_code: z.union([z.boolean(), z.string().transform(val => 
      typeof val === 'string' ? val.toLowerCase() === 'true' : val
    )]).default(false),
    aspect: z.union([
      z.string().transform(val => {
        const lowerVal = val.toLowerCase();
        if (lowerVal.includes('technical')) return 'technical';
        if (lowerVal.includes('business')) return 'business';
        if (lowerVal.includes('design')) return 'design';
        return 'general';
      }),
      z.enum(['technical', 'business', 'design', 'general'])
    ]).optional(),
  }),
  constraints: z.object({
    format: z.union([
      z.string().transform(val => {
        const lowerVal = val.toLowerCase();
        if (lowerVal.includes('step') || lowerVal.includes('guide')) return 'steps';
        if (lowerVal.includes('checklist') || lowerVal.includes('list')) return 'checklist';
        if (lowerVal.includes('code') || lowerVal.includes('example')) return 'code';
        return 'explanation';
      }),
      z.enum(['steps', 'checklist', 'code', 'explanation'])
    ]).optional(),
    length: z.union([
      z.string().transform(val => {
        const lowerVal = val.toLowerCase();
        if (lowerVal.includes('brief') || lowerVal.includes('short')) return 'brief';
        if (lowerVal.includes('detailed') || lowerVal.includes('comprehensive')) return 'detailed';
        return 'moderate';
      }),
      z.enum(['brief', 'moderate', 'detailed'])
    ]).default('moderate'),
    tone: z.union([
      z.string().transform(val => {
        const lowerVal = val.toLowerCase();
        if (lowerVal.includes('casual') || lowerVal.includes('informal')) return 'casual';
        if (lowerVal.includes('technical') || lowerVal.includes('expert')) return 'technical';
        if (lowerVal.includes('friendly') || lowerVal.includes('warm')) return 'friendly';
        return 'professional';
      }),
      z.enum(['casual', 'professional', 'friendly', 'technical'])
    ]).default('professional'),
  }),
  needs_clarification: z.boolean().optional(),
  clarification_question: z.string().optional(),
  system_instructions: z.string().describe("Detailed instructions for the second LLM call"),
  target_audience: z.string().optional().describe("Description of the target audience for the response"),
  risk_flags: z.union([
    z.array(z.string()),
    z.string().transform(str => [str])
  ]).optional().describe("Any potential risks or sensitive topics to handle carefully"),
}).describe("Structured analysis of the user's input to guide the response generation");
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
  parseTextParts,
  EModelEndpoint,
  ContentTypes,
  VisionModes,
  ErrorTypes,
  Constants,
  AuthKeys,
} = require('librechat-data-provider');
const { getSafetySettings } = require('~/server/services/Endpoints/google/llm');
const { encodeAndFormat } = require('~/server/services/Files/images');
const { spendTokens } = require('~/models/spendTokens');
const { getModelMaxTokens } = require('~/utils');
const { sleep } = require('~/server/utils');
const { logger } = require('~/config');
const {
  formatMessage,
  createContextHandlers,
  titleInstruction,
  truncateText,
  followupPrompt,
  buildSystemInstruction,
} = require('./prompts');
const BaseClient = require('./BaseClient');

const loc = process.env.GOOGLE_LOC || 'us-central1';
const publisher = 'google';
const endpointPrefix =
  loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;

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
      serviceKey && typeof serviceKey === 'string' ? JSON.parse(serviceKey) : (serviceKey ?? {});
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
    this.visionMode = VisionModes.generative;
    /** @type {string} */
    this.systemMessage;
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
    this.isGenerativeModel = /gemini|learnlm|gemma/.test(this.modelOptions.model);

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
      // Ensure we properly combine the prompt prefix with the artifacts prompt
      promptPrefix = promptPrefix ? `${promptPrefix}\n\n${this.options.artifactsPrompt}` : this.options.artifactsPrompt;
    }
        // promptPrefix = buildSystemInstruction(promptPrefix);


    this.systemMessage = promptPrefix;
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
    this.defaultVisionModel =
      this.options.visionModel ??
      (!EXCLUDED_GENAI_MODELS.test(this.modelOptions.model)
        ? this.modelOptions.model
        : 'gemini-pro-vision');
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
    return ((message) => {
      const msg = {
        author: message?.author ?? (message.isCreatedByUser ? this.userLabel : this.modelLabel),
        content: message?.content ?? message.text,
      };

      if (!message.image_urls?.length) {
        return msg;
      }

      msg.content = (
        !Array.isArray(msg.content)
          ? [
              {
                type: ContentTypes.TEXT,
                [ContentTypes.TEXT]: msg.content,
              },
            ]
          : msg.content
      ).concat(message.image_urls);

      return msg;
    }).bind(this);
  }

  /**
   * Formats messages for generative AI
   * @param {TMessage[]} messages
   * @returns
   */
  async formatGenerativeMessages(messages) {
    const formattedMessages = [];
    const latestMessage = { ...messages[messages.length - 1] };
    
    if (this.options.attachments) {
      const attachments = await this.options.attachments;
      
      // Update message_file_map for new attachments
      if (this.message_file_map) {
        this.message_file_map[latestMessage.messageId] = attachments;
      } else {
        this.message_file_map = {
          [latestMessage.messageId]: attachments,
        };
      }
      
      const files = await this.addImageURLs(latestMessage, attachments, VisionModes.generative);
      this.options.attachments = files;
      messages[messages.length - 1] = latestMessage;
    }
  
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

  /**`
   * Builds the augmented prompt for attachments
   * TODO: Add File API Support
   * @param {TMessage[]} messages
   */
  async buildAugmentedPrompt(messages = []) {
    const latestMessage = { ...messages[messages.length - 1] };

    // Existing code for new attachments
    if (this.options.attachments) {
      const attachments = await this.options.attachments;

      // Initialize message_file_map if it doesn't exist
      if (this.message_file_map) {
        this.message_file_map[latestMessage.messageId] = attachments;
      } else {
        this.message_file_map = {
          [latestMessage.messageId]: attachments,
        };
      }

      this.contextHandlers = createContextHandlers(this.options.req, latestMessage.text);

      if (this.contextHandlers) {
        for (const file of attachments) {
          if (file.embedded) {
            this.contextHandlers?.processFile(file);
            continue;
          }
          if (file.metadata?.fileIdentifier) {
            continue;
          }
        }

        this.augmentedPrompt = await this.contextHandlers.createContext();
        this.systemMessage = this.augmentedPrompt + this.systemMessage;
      }
      return; // Exit early if we processed new attachments
    }

    // Handle embedded files from previous messages when no new attachments
    const embeddedFiles = [];

    // Check message_file_map first
    if (this.message_file_map) {
      Object.values(this.message_file_map)
        .flat()
        .forEach((file) => {
          if (file.embedded && !embeddedFiles.some((f) => f.file_id === file.file_id)) {
            embeddedFiles.push(file);
          }
        });
    } else {
      // If message_file_map doesn't exist, check message files directly
      for (const message of messages) {
        if (message.files) {
          for (const file of message.files) {
            if (file.embedded && !embeddedFiles.some((f) => f.file_id === file.file_id)) {
              embeddedFiles.push(file);
            }
          }
        }
      }
    }

    // Create context handlers for embedded files
    if (embeddedFiles.length > 0) {
      this.contextHandlers = createContextHandlers(this.options.req, latestMessage.text);

      if (this.contextHandlers) {
        for (const file of embeddedFiles) {
          this.contextHandlers.processFile(file);
        }

        this.augmentedPrompt = await this.contextHandlers.createContext();
        this.systemMessage = this.augmentedPrompt + this.systemMessage;
      }
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

    if (this.systemMessage) {
      const instructionsTokenCount = this.getTokenCount(this.systemMessage);

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

    if (this.systemMessage) {
      payload.instances[0].context = this.systemMessage;
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

    let promptPrefix = (this.systemMessage ?? '').trim();

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
      this.visionMode = undefined;
      clientOptions.streaming = true;
      const client = new ChatVertexAI(clientOptions);
      client.temperature = clientOptions.temperature;
      client.topP = clientOptions.topP;
      client.topK = clientOptions.topK;
      client.topLogprobs = clientOptions.topLogprobs;
      client.frequencyPenalty = clientOptions.frequencyPenalty;
      client.presencePenalty = clientOptions.presencePenalty;
      client.maxOutputTokens = clientOptions.maxOutputTokens;
      return client;
    } else if (!EXCLUDED_GENAI_MODELS.test(model)) {
      logger.debug('Creating GenAI client');
      return new GenAI(this.apiKey).getGenerativeModel({ model }, requestOptions);
    }

    logger.debug('Creating Chat Google Generative AI client');
    return new ChatGoogleGenerativeAI({ ...clientOptions, apiKey: this.apiKey });
  }

  initializeClient() {
    let clientOptions = { ...this.modelOptions };

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

  /**
   * Analyzes user input using a lightweight model to extract intent, context, and constraints.
   * This is the first step in the two-step LLM call process.
   * @param {string} userInput - The user's input text to analyze
   * @param {Object} metadata - Additional metadata about the user/context
   * @returns {Promise<Object>} Structured analysis of the input
   */
  async analyzeInput(userInput, metadata = {}, onProgress) {
    // Create a clean version of user input (single line, max 500 chars)
    const cleanInput = userInput
      .replace(/[\n\r]+/g, ' ')
      .replace(/"/g, "'")
      .substring(0, 500);
    const truncated = userInput.length > 500 ? '...' : '';
    
    // const analysisPrompt = `Analyze this input and respond in JSON format. If the request is ambiguous (like about creating an app without specifying aspect), ask for clarification:
    const hasContext = metadata.hasAskedClarification || metadata.previousResponse || metadata.clarificationRound > 0;
    // NEW: Include conversation history
const recentHistory = metadata.conversationHistory ? 
metadata.conversationHistory.slice(-2).map(msg => `${msg.role}: ${msg.text}`).join('\n') : '';

const analysisPrompt = `Analyze this input considering the conversation context:

${recentHistory ? `Recent conversation:\n${recentHistory}\n` : ''}
Current input: "${cleanInput}${truncated}"
Context: ${metadata.skillLevel ? `Skill: ${metadata.skillLevel}` : ''} ${metadata.previousContext ? '| Has context' : ''}

${hasContext ? 'The user has already provided clarification or this is a follow-up. Use the conversation context to understand what they\'re referring to.' : 'If the request is very ambiguous, ask for clarification:'}

First, determine if the request is about:
1. Technical implementation (UI/UX, backend, infrastructure)
2. Business aspects (model, strategy, funding)
3. Design (UI/UX, user flows, wireframes)
4. General guidance

Then respond with a JSON object containing:
- intent: Main purpose (1-3 words, be specific about the aspect)
- needs_clarification: true if the request is too broad
- clarification_question: Question to ask user (if needs_clarification is true)
- context: { 
    domain: string, 
    complexity: enum, 
    requires_code: boolean,
    aspect: enum['technical', 'business', 'design', 'general']
  }
- constraints: { format: enum, length: enum, tone: enum }
- system_instructions: string (specific to the identified aspect)
- target_audience: string (optional)
- risk_flags: string[] (optional)

Keep responses brief and use enums from the schema.`;
    try {
      // Use a lightweight model for analysis
      const originalModel = this.modelOptions.model;
      this.modelOptions.model = 'gemini-2.5-flash';
      
      // Create a new abort controller for the analysis phase
      const analysisAbortController = new AbortController();
      
      try {
        const response = await this.getCompletion(
          [
            {
              role: 'user',
              parts: [{ text: analysisPrompt }],
            },
          ],
          { 
            stream: false,
            abortController: analysisAbortController,
            format: 'json',
            // onProgress: onProgress ? (chunk) => {
            //   try {
            //     onProgress(chunk);
            //   } catch (error) {
            //     logger.error('Error in analysis progress callback:', error);
            //   }
            // } : undefined
            onProgress: ()=>{}// Hide analysis phase from frontend
          }
        );
        // Clean up the abort controller
        analysisAbortController.abort();
        
        let analysis;
        try {
          // First, try to extract JSON from markdown code block if present
          let jsonStr = response;
          const jsonMatch = response.match(/```(?:json)?\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            jsonStr = jsonMatch[1];
          } else {
            // If no code block, try to find standalone JSON
            const jsonMatchBrace = response.match(/\{.*\}/s);
            if (jsonMatchBrace) {
              jsonStr = jsonMatchBrace[0];
            }
          }
          
          // Clean up the JSON string
          jsonStr = jsonStr.trim()
            .replace(/^```(?:json)?/, '') // Remove opening code block if present
            .replace(/```$/, '') // Remove closing code block if present
            .trim();
            
          logger.debug('Parsing analysis JSON:', jsonStr);
          const parsed = JSON.parse(jsonStr);
          
          // Validate against schema with detailed error messages
          analysis = AnalysisSchema.safeParse(parsed);
          
          if (!analysis.success) {
            const errorDetails = analysis.error.issues.map(issue => 
              `- ${issue.path.join('.')}: ${issue.message}`
            ).join('\n');
            logger.error('Analysis validation failed with issues:', {
              issues: analysis.error.issues,
              response: jsonStr
            });
            
            // Create a fallback analysis with default values
            const fallbackAnalysis = {
              intent: 'general',
              context: {
                domain: 'general',
                complexity: 'intermediate',
                requires_code: false,
                aspect: 'general'
              },
              constraints: {
                format: 'explanation',
                length: 'moderate',
                tone: 'professional',
              },
              system_instructions: parsed.system_instructions || 'Provide a helpful response to the user query.',
              target_audience: parsed.target_audience || 'general audience',
              risk_flags: [],
              needs_clarification: false,
              clarification_question: ''
            };
            
            logger.warn('Using fallback analysis due to validation errors');
            return fallbackAnalysis;
          }
          
          return analysis.data;
          
        } catch (parseError) {
          logger.error('Failed to parse analysis response:', {
            error: parseError,
            response: response.substring(0, 500) + (response.length > 500 ? '...' : '')
          });
          
          // Return a default analysis object if parsing fails
          return {
            intent: 'general',
            context: {
              domain: 'general',
              complexity: 'intermediate',
              requires_code: false,
              aspect: 'general'
            },
            constraints: {
              format: 'explanation',
              length: 'moderate',
              tone: 'professional',
            },
            system_instructions: 'Provide a helpful response to the user query.',
            target_audience: 'general audience',
            risk_flags: [],
            needs_clarification: false,
            clarification_question: ''
          };
        }
        
        return analysis;
      } catch (error) {
        // Ensure we clean up even if there's an error
        analysisAbortController.abort();
        throw error;
      } finally {
        // Always restore the original model
        this.modelOptions.model = originalModel;
      }

      // Parse and validate the response
      let analysis;
      try {
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : response;
        const parsed = JSON.parse(jsonStr);
        analysis = AnalysisSchema.parse(parsed);
      } catch (parseError) {
        logger.error('Failed to parse analysis response:', parseError);
        throw new Error('Failed to analyze input. Please try again.');
      }

      return analysis;
    } catch (error) {
      logger.error('Error in analyzeInput:', error);
      // Fallback to default analysis
      return {
        intent: 'general',
        context: {
          domain: 'general',
          complexity: 'intermediate',
          requires_code: false,
          aspect: 'general'
        },
        constraints: {
          format: 'explanation',
          length: 'moderate',
          tone: 'professional',
        },
        system_instructions: 'Provide a helpful response to the user\'s query.',
        target_audience: 'general',
        risk_flags: [],
        needs_clarification: false,
        clarification_question: ''
      };
    }
  }

  async getCompletion(_payload, options = {}) {
    const { onProgress, abortController } = options;
    const safetySettings = getSafetySettings(this.modelOptions.model);
    const streamRate = this.options.streamRate ?? Constants.DEFAULT_STREAM_RATE;
    const modelName = this.modelOptions.modelName ?? this.modelOptions.model ?? '';

    let reply = '';
    /** @type {Error} */
    let error;
    try {
      if (!EXCLUDED_GENAI_MODELS.test(modelName) && !this.project_id) {
        /** @type {GenerativeModel} */
        const client = this.client;
        /** @type {GenerateContentRequest} */
        const requestOptions = {
          safetySettings,
          contents: _payload,
          generationConfig: googleGenConfigSchema.parse(this.modelOptions),
        };

        const promptPrefix = (this._internalSystemInstructions || this.systemMessage || '').trim();
        if (promptPrefix.length) {
          requestOptions.systemInstruction = {
            parts: [
              {
                text: promptPrefix,
              },
            ],
          };

          logger.debug('[GoogleClient] System instruction set:', { 
            hasArtifactsPrompt: !!this.options.artifactsPrompt,
            promptPrefixLength: promptPrefix.length 
          });
        }

        const delay = modelName.includes('flash') ? 8 : 15;
        /** @type {GenAIUsageMetadata} */
        let usageMetadata;

        abortController.signal.addEventListener(
          'abort',
          () => {
            logger.warn('[GoogleClient] Request was aborted', abortController.signal.reason);
          },
          { once: true },
        );

        const result = await client.generateContentStream(requestOptions, {
          signal: abortController.signal,
        });
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
      } else if (!this.isVisionModel && this.systemMessage && messages?.length > 0) {
        // Apply stored system instructions silently for Vertex path when no explicit context
        messages.unshift(new SystemMessage(this.systemMessage));
      }

      /** @type {import('@langchain/core/messages').AIMessageChunk['usage_metadata']} */
      let usageMetadata;
      /** @type {ChatVertexAI} */
      const client = this.client;
      const stream = await client.stream(messages, {
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
        if (chunk?.usage_metadata) {
          const metadata = chunk.usage_metadata;
          for (const key in metadata) {
            if (Number.isNaN(metadata[key])) {
              delete metadata[key];
            }
          }

          usageMetadata = !usageMetadata ? metadata : concat(usageMetadata, metadata);
        }

        const chunkText = chunk?.content ?? '';
        await this.generateTextStream(chunkText, onProgress, {
          delay,
        });
        reply += chunkText;
      }

      if (usageMetadata) {
        this.usage = usageMetadata;
      }
    } catch (e) {
      error = e;
      logger.error('[GoogleClient] There was an issue generating the completion', e);
    }

    if (error != null && reply === '') {
      const errorMessage = `{ "type": "${ErrorTypes.GoogleError}", "info": "${
        error.message ?? 'The Google provider failed to generate content, please contact the Admin.'
      }" }`;
      throw new Error(errorMessage);
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

  getMessageMapMethod() {
    /**
     * @param {TMessage} msg
     */
    return (msg) => {
      if (msg.text != null && msg.text && msg.text.startsWith(':::thinking')) {
        msg.text = msg.text.replace(/:::thinking.*?:::/gs, '').trim();
      } else if (msg.content != null) {
        msg.text = parseTextParts(msg.content, true);
        delete msg.content;
      }

      return msg;
    };
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
    let reply = '';
    const { abortController } = options;

    const model =
      this.options.titleModel ?? this.modelOptions.modelName ?? this.modelOptions.model ?? '';
    const safetySettings = getSafetySettings(model);
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

      const promptPrefix = (this.systemMessage ?? '').trim();
      if (promptPrefix.length) {
        requestOptions.systemInstruction = {
          parts: [
            {
              text: promptPrefix,
            },
          ],
        };
        logger.debug('[GoogleClient] System instruction set:', { 
          hasArtifactsPrompt: !!this.options.artifactsPrompt,
          promptPrefixLength: promptPrefix.length 
        });
      }

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
/**
 * Uses AI to generate a contextual follow-up question based on the response
 * @param {Object} analysis - The input analysis object
 * @param {string} userInput - The original user input
 * @param {string} response - The generated response
 * @returns {Promise<string|null>} Follow-up question or null
 */
async generateFollowUpQuestion(analysis, userInput, response) {
  // Don't add follow-up if this was already a clarification
  if (analysis.needs_clarification) {
    return null;
  }

  try {
    const originalModel = this.modelOptions.model;
    this.modelOptions.model = 'gemini-2.5-flash';
    
    const followUpPrompt = `Based on this conversation, generate ONLY a single follow-up question:

User asked: "${userInput.substring(0, 200)}"
Response given: "${response.substring(0, 300)}..."

Generate ONE contextual follow-up question that would help the user explore this topic further. Use phrases like "Would you like me to...", "Should I...", "Do you want to...", or "Would it help if I...".

Return ONLY the question, nothing else. No explanations, no additional text, just the question.`;

    const followUpResponse = await this.getCompletion(
      [
        {
          role: 'user',
          parts: [{ text: followUpPrompt }],
        },
      ],
      { 
        stream: false,
        abortController: new AbortController(),
        onProgress: () => {}
      }
    );

    this.modelOptions.model = originalModel;
    console.log("Followup response by model-->>",followUpResponse.trim())
    return followUpResponse.trim();
    
  } catch (error) {
    logger.error('Error generating follow-up question:', error);
    return null;
  }
}
  /**
   * Sends a completion request, optionally using a two-step process:
   * 1. Analyze the input with a lightweight model
   * 2. Generate a response using the analysis
   * @param {Array|Object} payload - The input messages or prompt
   * @param {Object} opts - Options for the completion
   * @param {boolean} [opts.twoStep=true] - Whether to use the two-step process
   * @param {Object} [opts.metadata] - Additional metadata for analysis
   * @returns {Promise<string>} The generated completion
   */
  async sendCompletion(payload, opts = {}) {
    console.log('[GoogleClient] Starting sendCompletion with twoStep:', opts.twoStep !== false);
    const {
      twoStep = true,
      metadata = {},
      onProgress,
      abortController,
      ...completionOpts
    } = opts;
    
    // Ensure onProgress is a function or undefined
    const safeOnProgress = typeof onProgress === 'function' ? onProgress : undefined;

    // If not using two-step or payload is not in the expected format, use direct completion
    if (!twoStep || !Array.isArray(payload) || payload.length === 0) {
      return (await this.getCompletion(payload, { ...opts, stream: false })).trim();
    }

    try {
      // Extract the last user message for analysis
      const lastUserMessage = [...payload].reverse().find(m => m.role === 'user');
      if (!lastUserMessage) {
        throw new Error('No user message found in payload');
      }

      // Step 1: Analyze the input
      console.log('[GoogleClient] Starting analysis phase with lightweight model...');
      const userInput = lastUserMessage.parts?.map(p => p.text || '').join('\n') || '';
      
      // Show analysis progress if onProgress is provided
      if (safeOnProgress) {
        safeOnProgress('[Analyzing your request...]');
      }
      
      // Pass the safeOnProgress callback to analyzeInput
      // Track clarification rounds properly
const clarificationRound = metadata.clarificationRound || 0;
const enhancedMetadata = {
    ...metadata,
    clarificationRound,
    previousResponse: opts.previousResponse,
    hasAskedClarification: clarificationRound > 0
};

// const analysis = await this.analyzeInput(userInput, enhancedMetadata, safeOnProgress);
const conversationHistory = payload.slice(-3).map(msg => ({
  role: msg.role,
  text: msg.parts?.[0]?.text || ''
}));

const analysis = await this.analyzeInput(userInput, {
  ...enhancedMetadata,
  conversationHistory
}, safeOnProgress);
console.log('[GoogleClient] Analysis complete. Intent:', analysis.intent);

// Log analysis for debugging
logger.debug('Input analysis:', analysis);

// Only ask for clarification on the first unclear message
// if (analysis.needs_clarification && analysis.clarification_question && clarificationRound === 0) {
//   return analysis.clarification_question;
// }

const shouldAskClarification = analysis.needs_clarification && analysis.clarification_question;

if (shouldAskClarification) {
  return analysis.clarification_question;
}

      // Prepare the enhanced payload with system instructions
      // Store system instructions silently; do not inject into the outgoing payload
this._internalSystemInstructions = (this.augmentedPrompt || '') + analysis.system_instructions;


      // Ensure all messages have valid roles for Google's API
      // Do NOT push system instructions as a normal message to avoid streaming them to the user
      const enhancedPayload = payload
        .map((msg) => ({
          ...msg,
          role: msg.role === 'assistant' ? 'model' : 'user', // Convert 'assistant' to 'model'
        }))
        .filter((msg) => msg.role === 'user' || msg.role === 'model'); // Only include valid roles

      // Step 2: Generate the response using the full model
      console.log('[GoogleClient] Starting generation phase with full model...');
      
      // Create a wrapper for onProgress to handle potential undefined
      const generationOnProgress = safeOnProgress ? (chunk) => {
        try {
          safeOnProgress(chunk);
        } catch (error) {
          logger.error('Error in onProgress callback:', error);
        }
      } : undefined;
      
      const response = await this.getCompletion(
        enhancedPayload,
        {
          ...completionOpts,
          onProgress: generationOnProgress,
          abortController,
          model: this.modelOptions.model, // Use the original model
          temperature: analysis.constraints.tone === 'technical' ? 0.2 : 0.7,
          max_tokens: analysis.constraints.length === 'brief' ? 500 : 
                     analysis.constraints.length === 'detailed' ? 2000 : 1000
        }
      );
      console.log('[GoogleClient] Generation complete. Response length:', response.length);

      // return response.trim();
      // Generate AI-powered follow-up question
      const followUpQuestion = await this.generateFollowUpQuestion(analysis, userInput, response);
      const finalResponse = followUpQuestion ? 
      `${response.trim()}\n\n${followUpQuestion}` : 
      response.trim();
      return finalResponse;
    } catch (error) {
      logger.error('Error in two-step completion:', error);
      // Fall back to direct completion if two-step fails
      return (await this.getCompletion(payload, { ...opts, stream: false })).trim();
    }
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
