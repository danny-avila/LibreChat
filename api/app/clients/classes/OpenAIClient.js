const BaseClient = require('./BaseClient');
const ChatGPTClient = require('./ChatGPTClient');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('@dqbd/tiktoken');

const tokenizersCache = {};

class OpenAIClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.ChatGPTClient = new ChatGPTClient();
    this.buildPrompt = this.ChatGPTClient.buildPrompt.bind(this);
    this.getCompletion = this.ChatGPTClient.getCompletion.bind(this);
    this.getTokenCountForMessage = this.ChatGPTClient.getTokenCountForMessage.bind(this);
    this.sender = options.sender || 'ChatGPT';
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
        temperature: typeof modelOptions.temperature === 'undefined' ? 0.8 : modelOptions.temperature,
        top_p: typeof modelOptions.top_p === 'undefined' ? 1 : modelOptions.top_p,
        presence_penalty: typeof modelOptions.presence_penalty === 'undefined' ? 1 : modelOptions.presence_penalty,
        stop: modelOptions.stop,
      };
    }

    this.isChatCompletion = this.options.reverseProxyUrl || this.options.localAI || this.modelOptions.model.startsWith('gpt-');
    this.isChatGptModel = this.isChatCompletion;
    if (this.modelOptions.model === 'text-davinci-003') {
      this.isChatCompletion = false;
      this.isChatGptModel = false;
    }
    const { isChatGptModel } = this;
    this.isUnofficialChatGptModel = this.modelOptions.model.startsWith('text-chat') || this.modelOptions.model.startsWith('text-davinci-002-render');
    this.maxContextTokens = this.options.maxContextTokens || (isChatGptModel ? 4095 : 4097);
    this.maxResponseTokens = this.modelOptions.max_tokens || 1024;
    this.maxPromptTokens = this.options.maxPromptTokens || (this.maxContextTokens - this.maxResponseTokens);

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(`maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${this.maxPromptTokens + this.maxResponseTokens}) must be less than or equal to maxContextTokens (${this.maxContextTokens})`);
    }

    this.userLabel = this.options.userLabel || 'User';
    this.chatGptLabel = this.options.chatGptLabel || 'ChatGPT';

    this.setupTokens();
    this.setupTokenizer();

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

  setupTokenizer() {
    this.encoding = 'text-davinci-003';
    if (this.isChatCompletion) {
      this.encoding = 'cl100k_base';
      this.gptEncoder = this.constructor.getTokenizer(this.encoding);
    } else if (this.isUnofficialChatGptModel) {
      this.gptEncoder = this.constructor.getTokenizer(this.encoding, true, {
        '<|im_start|>': 100264,
        '<|im_end|>': 100265,
      });
    } else {
      try {
        this.encoding = this.modelOptions.model;
        this.gptEncoder = this.constructor.getTokenizer(this.modelOptions.model, true);
      } catch {
        this.gptEncoder = this.constructor.getTokenizer(this.encoding, true);
      }
    }
  }

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

  freeAndResetEncoder() {
    try {
      if (!this.gptEncoder) {
        return;
      }
      this.gptEncoder.free();
      delete tokenizersCache[this.encoding];
      this.setupTokenizer();
      tokenizersCache.count = 0;
    } catch (error) {
      console.log('freeAndResetEncoder error');
      console.error(error);
    }
  }

  getTokenCount(text) {
    try {
      if (tokenizersCache.count >= 25) {
        this.freeAndResetEncoder();
      }
      tokenizersCache.count = (tokenizersCache.count || 0) + 1;
      return this.gptEncoder.encode(text, 'all').length;
    } catch (error) {
      this.freeAndResetEncoder();
      return this.gptEncoder.encode(text, 'all').length;
    }
  }

  getSaveOptions() {
    return {
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      ...this.modelOptions
    };
  }

  getBuildMessagesOptions(opts) {
    return {
      isChatCompletion: this.isChatCompletion,
      promptPrefix: opts.promptPrefix,
    };
  }

  async buildMessages(messages, parentMessageId, { isChatCompletion = false, promptPrefix = null }) {
    if (!isChatCompletion) {
      return await this.buildPrompt(messages, parentMessageId, { isChatGptModel: isChatCompletion, promptPrefix });
    }

    const payload = [];
    let instructions;
    const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);

    promptPrefix = (promptPrefix || this.options.promptPrefix || '').trim();
    if (promptPrefix) {
      promptPrefix = `Instructions:\n${promptPrefix}`;
      instructions = {
        role: 'system',
        name: 'instructions',
        content: promptPrefix,
      };
    }

    const formattedMessages = orderedMessages.map((message) => {
      let { role: _role, sender, text } = message;
      const role = _role ?? sender;
      const formattedMessage = {
        role: role?.toLowerCase() === 'user' ? 'user' : 'assistant',
        content: text ?? '',
      };

      if (this.options?.name && formattedMessage.role === 'user') {
        formattedMessage.name = this.options.name;
      }

      return formattedMessage;
    });

    if (formattedMessages.length > 1) {
      payload.push(...formattedMessages.slice(0, -1));
    }
  
    payload.push(instructions);
  
    if (formattedMessages.length > 0) {
      payload.push(formattedMessages[formattedMessages.length - 1]);
    }

    if (isChatCompletion) {
      return { prompt: payload };
    }

    return { prompt };
  }

  async sendCompletion(payload, opts = {}) {
    let reply = '';
    let result = null;
    if (typeof opts.onProgress === 'function') {
      await this.getCompletion(
        payload,
        (progressMessage) => {
          if (progressMessage === '[DONE]') {
            return;
          }
          const token = this.isChatCompletion ? progressMessage.choices?.[0]?.delta?.content : progressMessage.choices?.[0]?.text;
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

    return reply.trim();
  }
}

module.exports = OpenAIClient;
