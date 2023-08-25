const BaseClient = require('./BaseClient');
const ChatGPTClient = require('./ChatGPTClient');
const {
  encoding_for_model: encodingForModel,
  get_encoding: getEncoding,
} = require('@dqbd/tiktoken');
const { maxTokensMap, genAzureChatCompletion } = require('../../utils');

// Cache to store Tiktoken instances
const tokenizersCache = {};
// Counter for keeping track of the number of tokenizer calls
let tokenizerCallsCount = 0;

class OpenAIClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.ChatGPTClient = new ChatGPTClient();
    this.buildPrompt = this.ChatGPTClient.buildPrompt.bind(this);
    this.getCompletion = this.ChatGPTClient.getCompletion.bind(this);
    this.sender = options.sender ?? 'ChatGPT';
    this.contextStrategy = options.contextStrategy
      ? options.contextStrategy.toLowerCase()
      : 'discard';
    this.shouldRefineContext = this.contextStrategy === 'refine';
    this.azure = options.azure || false;
    if (this.azure) {
      this.azureEndpoint = genAzureChatCompletion(this.azure);
    }
    this.setOptions(options);
  }

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
    }

    this.isChatCompletion =
      this.options.reverseProxyUrl ||
      this.options.localAI ||
      this.modelOptions.model.startsWith('gpt-');
    this.isChatGptModel = this.isChatCompletion;
    if (this.modelOptions.model === 'text-davinci-003') {
      this.isChatCompletion = false;
      this.isChatGptModel = false;
    }
    const { isChatGptModel } = this;
    this.isUnofficialChatGptModel =
      this.modelOptions.model.startsWith('text-chat') ||
      this.modelOptions.model.startsWith('text-davinci-002-render');
    this.maxContextTokens = maxTokensMap[this.modelOptions.model] ?? 4095; // 1 less than maximum
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

    this.userLabel = this.options.userLabel || 'User';
    this.chatGptLabel = this.options.chatGptLabel || 'Assistant';

    this.setupTokens();

    if (!this.modelOptions.stop) {
      const stopTokens = [this.startToken];
      if (this.endToken && this.endToken !== this.startToken) {
        stopTokens.push(this.endToken);
      }
      stopTokens.push(`\n${this.userLabel}:`);
      stopTokens.push('<|diff_marker|>');
      this.modelOptions.stop = stopTokens;
    }

    if (this.options.reverseProxyUrl) {
      this.completionsUrl = this.options.reverseProxyUrl;
    } else if (isChatGptModel) {
      this.completionsUrl = 'https://api.openai.com/v1/chat/completions';
    } else {
      this.completionsUrl = 'https://api.openai.com/v1/completions';
    }

    if (this.azureEndpoint) {
      this.completionsUrl = this.azureEndpoint;
    }

    if (this.azureEndpoint && this.options.debug) {
      console.debug(`Using Azure endpoint: ${this.azureEndpoint}`, this.azure);
    }

    return this;
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
        this.encoding = this.modelOptions.model;
        tokenizer = this.constructor.getTokenizer(this.modelOptions.model, true);
      } catch {
        tokenizer = this.constructor.getTokenizer(this.encoding, true);
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
      console.log('Free and reset encoders error');
      console.error(error);
    }
  }

  // Checks if the cache of tokenizers has reached a certain size. If it has, it frees and resets all tokenizers.
  resetTokenizersIfNecessary() {
    if (tokenizerCallsCount >= 25) {
      if (this.options.debug) {
        console.debug('freeAndResetAllEncoders: reached 25 encodings, resetting...');
      }
      this.constructor.freeAndResetAllEncoders();
    }
    tokenizerCallsCount++;
  }

  // Returns the token count of a given text. It also checks and resets the tokenizers if necessary.
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

  getSaveOptions() {
    return {
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
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

  async buildMessages(
    messages,
    parentMessageId,
    { isChatCompletion = false, promptPrefix = null },
  ) {
    if (!isChatCompletion) {
      return await this.buildPrompt(messages, parentMessageId, {
        isChatGptModel: isChatCompletion,
        promptPrefix,
      });
    }

    let payload;
    let instructions;
    let tokenCountMap;
    let promptTokens;
    let orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);

    promptPrefix = (promptPrefix || this.options.promptPrefix || '').trim();
    if (promptPrefix) {
      promptPrefix = `Instructions:\n${promptPrefix}`;
      instructions = {
        role: 'system',
        name: 'instructions',
        content: promptPrefix,
      };

      if (this.contextStrategy) {
        instructions.tokenCount = this.getTokenCountForMessage(instructions);
      }
    }

    const formattedMessages = orderedMessages.map((message) => {
      let { role: _role, sender, text } = message;
      const role = _role ?? sender;
      const content = text ?? '';
      const formattedMessage = {
        role: role?.toLowerCase() === 'user' ? 'user' : 'assistant',
        content,
      };

      if (this.options?.name && formattedMessage.role === 'user') {
        formattedMessage.name = this.options.name;
      }

      if (this.contextStrategy) {
        formattedMessage.tokenCount =
          message.tokenCount ?? this.getTokenCountForMessage(formattedMessage);
      }

      return formattedMessage;
    });

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

    return result;
  }

  async sendCompletion(payload, opts = {}) {
    let reply = '';
    let result = null;
    let streamResult = null;
    if (typeof opts.onProgress === 'function') {
      await this.getCompletion(
        payload,
        (progressMessage) => {
          if (progressMessage === '[DONE]') {
            return;
          }

          if (progressMessage.choices) {
            streamResult = progressMessage;
          }
          const token = this.isChatCompletion
            ? progressMessage.choices?.[0]?.delta?.content
            : progressMessage.choices?.[0]?.text;
          // first event's delta content is always undefined
          if (!token) {
            return;
          }
          if (this.options.debug) {
            // console.debug(token);
          }
          if (token === this.endToken) {
            return;
          }
          opts.onProgress(token);
          reply += token;
        },
        opts.abortController || new AbortController(),
      );
    } else {
      result = await this.getCompletion(
        payload,
        null,
        opts.abortController || new AbortController(),
      );
      if (this.options.debug) {
        console.debug(JSON.stringify(result));
      }
      if (this.isChatCompletion) {
        reply = result.choices[0].message.content;
      } else {
        reply = result.choices[0].text.replace(this.endToken, '');
      }
    }

    if (streamResult && typeof opts.addMetadata === 'function') {
      const { finish_reason } = streamResult.choices[0];
      opts.addMetadata({ finish_reason });
    }
    return reply.trim();
  }

  getTokenCountForResponse(response) {
    return this.getTokenCountForMessage({
      role: 'assistant',
      content: response.text,
    });
  }
}

module.exports = OpenAIClient;
