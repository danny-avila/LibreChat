const crypto = require('crypto');
const Keyv = require('keyv');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('@dqbd/tiktoken');
const { fetchEventSource } = require('@waylaidwanderer/fetch-event-source');
const { Agent, ProxyAgent } = require('undici');
const BaseClient = require('./BaseClient');

const CHATGPT_MODEL = 'gpt-3.5-turbo';
const tokenizersCache = {};

class ChatGPTClient extends BaseClient {
  constructor(
    apiKey,
    options = {},
    cacheOptions = {},
  ) {
    super(apiKey, options, cacheOptions);

    cacheOptions.namespace = cacheOptions.namespace || 'chatgpt';
    this.conversationsCache = new Keyv(cacheOptions);
    this.setOptions(options);
  }

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

    if (this.options.openaiApiKey) {
      this.apiKey = this.options.openaiApiKey;
    }

    const modelOptions = this.options.modelOptions || {};
    this.modelOptions = {
      ...modelOptions,
      // set some good defaults (check for undefined in some cases because they may be 0)
      model: modelOptions.model || CHATGPT_MODEL,
      temperature: typeof modelOptions.temperature === 'undefined' ? 0.8 : modelOptions.temperature,
      top_p: typeof modelOptions.top_p === 'undefined' ? 1 : modelOptions.top_p,
      presence_penalty: typeof modelOptions.presence_penalty === 'undefined' ? 1 : modelOptions.presence_penalty,
      stop: modelOptions.stop,
    };

    this.isChatGptModel = this.modelOptions.model.startsWith('gpt-');
    const { isChatGptModel } = this;
    this.isUnofficialChatGptModel = this.modelOptions.model.startsWith('text-chat') || this.modelOptions.model.startsWith('text-davinci-002-render');
    const { isUnofficialChatGptModel } = this;

    // Davinci models have a max context length of 4097 tokens.
    this.maxContextTokens = this.options.maxContextTokens || (isChatGptModel ? 4095 : 4097);
    // I decided to reserve 1024 tokens for the response.
    // The max prompt tokens is determined by the max context tokens minus the max response tokens.
    // Earlier messages will be dropped until the prompt is within the limit.
    this.maxResponseTokens = this.modelOptions.max_tokens || 1024;
    this.maxPromptTokens = this.options.maxPromptTokens || (this.maxContextTokens - this.maxResponseTokens);

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(`maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${this.maxPromptTokens + this.maxResponseTokens}) must be less than or equal to maxContextTokens (${this.maxContextTokens})`);
    }

    this.userLabel = this.options.userLabel || 'User';
    this.chatGptLabel = this.options.chatGptLabel || 'ChatGPT';

    if (isChatGptModel) {
      // Use these faux tokens to help the AI understand the context since we are building the chat log ourselves.
      // Trying to use "<|im_start|>" causes the AI to still generate "<" or "<|" at the end sometimes for some reason,
      // without tripping the stop sequences, so I'm using "||>" instead.
      this.startToken = '||>';
      this.endToken = '';
      this.gptEncoder = this.constructor.getTokenizer('cl100k_base');
    } else if (isUnofficialChatGptModel) {
      this.startToken = '<|im_start|>';
      this.endToken = '<|im_end|>';
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
      // I chose not to do one for `chatGptLabel` because I've never seen it happen
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

  async getCompletion(input, onProgress, abortController = null) {
    if (!abortController) {
      abortController = new AbortController();
    }
    const modelOptions = { ...this.modelOptions };
    if (typeof onProgress === 'function') {
      modelOptions.stream = true;
    }
    if (this.isChatGptModel) {
      modelOptions.messages = input;
    } else {
      modelOptions.prompt = input;
    }
    const { debug } = this.options;
    const url = this.completionsUrl;
    if (debug) {
      console.debug();
      console.debug(url);
      console.debug(modelOptions);
      console.debug();
    }
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(modelOptions),
      dispatcher: new Agent({
        bodyTimeout: 0,
        headersTimeout: 0,
      }),
    };

    if (this.apiKey && this.options.azure && this.options.reverseProxyUrl) {
      opts.headers['api-key'] = this.apiKey;
    } else if (this.apiKey) {
      opts.headers.Authorization = `Bearer ${this.apiKey}`;
    }

    if (this.options.headers) {
      opts.headers = { ...opts.headers, ...this.options.headers };
    }

    if (this.options.proxy) {
      opts.dispatcher = new ProxyAgent(this.options.proxy);
    }

    if (modelOptions.stream) {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve, reject) => {
        try {
          let done = false;
          await fetchEventSource(url, {
            ...opts,
            signal: abortController.signal,
            async onopen(response) {
              if (response.status === 200) {
                return;
              }
              if (debug) {
                console.debug(response);
              }
              let error;
              try {
                const body = await response.text();
                error = new Error(`Failed to send message. HTTP ${response.status} - ${body}`);
                error.status = response.status;
                error.json = JSON.parse(body);
              } catch {
                error = error || new Error(`Failed to send message. HTTP ${response.status}`);
              }
              throw error;
            },
            onclose() {
              if (debug) {
                console.debug('Server closed the connection unexpectedly, returning...');
              }
              // workaround for private API not sending [DONE] event
              if (!done) {
                onProgress('[DONE]');
                abortController.abort();
                resolve();
              }
            },
            onerror(err) {
              if (debug) {
                console.debug(err);
              }
              // rethrow to stop the operation
              throw err;
            },
            onmessage(message) {
              if (debug) {
                // console.debug(message);
              }
              if (!message.data || message.event === 'ping') {
                return;
              }
              if (message.data === '[DONE]') {
                onProgress('[DONE]');
                abortController.abort();
                resolve();
                done = true;
                return;
              }
              onProgress(JSON.parse(message.data));
            },
          });
        } catch (err) {
          reject(err);
        }
      });
    }
    const response = await fetch(
      url,
      {
        ...opts,
        signal: abortController.signal,
      },
    );
    if (response.status !== 200) {
      const body = await response.text();
      const error = new Error(`Failed to send message. HTTP ${response.status} - ${body}`);
      error.status = response.status;
      try {
        error.json = JSON.parse(body);
      } catch {
        error.body = body;
      }
      throw error;
    }
    return response.json();
  }

  async generateTitle(userMessage, botMessage) {
    const instructionsPayload = {
      role: 'system',
      content: `Write an extremely concise subtitle for this conversation with no more than a few words. All words should be capitalized. Exclude punctuation.

||>Message:
${userMessage.message}
||>Response:
${botMessage.message}

||>Title:`,
    };

    const titleGenClientOptions = JSON.parse(JSON.stringify(this.options));
    titleGenClientOptions.modelOptions = {
      model: 'gpt-3.5-turbo',
      temperature: 0,
      presence_penalty: 0,
      frequency_penalty: 0,
    };
    const titleGenClient = new ChatGPTClient(this.apiKey, titleGenClientOptions);
    const result = await titleGenClient.getCompletion([instructionsPayload], null);
    // remove any non-alphanumeric characters, replace multiple spaces with 1, and then trim
    return result.choices[0].message.content
      .replace(/[^a-zA-Z0-9' ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async sendMessage(
    message,
    opts = {},
  ) {
    if (opts.clientOptions && typeof opts.clientOptions === 'object') {
      this.setOptions(opts.clientOptions);
    }

    const conversationId = opts.conversationId || crypto.randomUUID();
    const parentMessageId = opts.parentMessageId || crypto.randomUUID();

    let conversation = typeof opts.conversation === 'object'
      ? opts.conversation
      : await this.conversationsCache.get(conversationId);

    let isNewConversation = false;
    if (!conversation) {
      conversation = {
        messages: [],
        createdAt: Date.now(),
      };
      isNewConversation = true;
    }

    const shouldGenerateTitle = opts.shouldGenerateTitle && isNewConversation;

    const userMessage = {
      id: crypto.randomUUID(),
      parentMessageId,
      role: 'User',
      message,
    };
    conversation.messages.push(userMessage);

    // Doing it this way instead of having each message be a separate element in the array seems to be more reliable,
    // especially when it comes to keeping the AI in character. It also seems to improve coherency and context retention.
    const { prompt: payload, context } = await this.buildPrompt(
      conversation.messages,
      userMessage.id,
      {
        isChatGptModel: this.isChatGptModel,
        promptPrefix: opts.promptPrefix,
      },
    );

    if (this.options.keepNecessaryMessagesOnly) {
      conversation.messages = context;
    }

    let reply = '';
    let result = null;
    if (typeof opts.onProgress === 'function') {
      await this.getCompletion(
        payload,
        (progressMessage) => {
          if (progressMessage === '[DONE]') {
            return;
          }
          const token = this.isChatGptModel ? progressMessage.choices[0].delta.content : progressMessage.choices[0].text;
          // first event's delta content is always undefined
          if (!token) {
            return;
          }
          if (this.options.debug) {
            console.debug(token);
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
      if (this.isChatGptModel) {
        reply = result.choices[0].message.content;
      } else {
        reply = result.choices[0].text.replace(this.endToken, '');
      }
    }

    // avoids some rendering issues when using the CLI app
    if (this.options.debug) {
      console.debug();
    }

    reply = reply.trim();

    const replyMessage = {
      id: crypto.randomUUID(),
      parentMessageId: userMessage.id,
      role: 'ChatGPT',
      message: reply,
    };
    conversation.messages.push(replyMessage);

    const returnData = {
      response: replyMessage.message,
      conversationId,
      parentMessageId: replyMessage.parentMessageId,
      messageId: replyMessage.id,
      details: result || {},
    };

    if (shouldGenerateTitle) {
      conversation.title = await this.generateTitle(userMessage, replyMessage);
      returnData.title = conversation.title;
    }

    await this.conversationsCache.set(conversationId, conversation);

    if (this.options.returnConversation) {
      returnData.conversation = conversation;
    }

    return returnData;
  }

  async buildPrompt(messages, parentMessageId, { isChatGptModel = false, promptPrefix = null }) {
    const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);

    promptPrefix = (promptPrefix || this.options.promptPrefix || '').trim();
    if (promptPrefix) {
      // If the prompt prefix doesn't end with the end token, add it.
      if (!promptPrefix.endsWith(`${this.endToken}`)) {
        promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
      }
      promptPrefix = `${this.startToken}Instructions:\n${promptPrefix}`;
    } else {
      const currentDateString = new Date().toLocaleDateString(
        'en-us',
        { year: 'numeric', month: 'long', day: 'numeric' },
      );
      promptPrefix = `${this.startToken}Instructions:\nYou are ChatGPT, a large language model trained by OpenAI. Respond conversationally.\nCurrent date: ${currentDateString}${this.endToken}\n\n`;
    }

    const promptSuffix = `${this.startToken}${this.chatGptLabel}:\n`; // Prompt ChatGPT to respond.

    const instructionsPayload = {
      role: 'system',
      name: 'instructions',
      content: promptPrefix,
    };

    const messagePayload = {
      role: 'system',
      content: promptSuffix,
    };

    let currentTokenCount;
    if (isChatGptModel) {
      currentTokenCount = this.getTokenCountForMessage(instructionsPayload) + this.getTokenCountForMessage(messagePayload);
    } else {
      currentTokenCount = this.getTokenCount(`${promptPrefix}${promptSuffix}`);
    }
    let promptBody = '';
    const maxTokenCount = this.maxPromptTokens;

    const context = [];

    // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    // Do this within a recursive async function so that it doesn't block the event loop for too long.
    const buildPromptBody = async () => {
      if (currentTokenCount < maxTokenCount && orderedMessages.length > 0) {
        const message = orderedMessages.pop();
        const roleLabel = message?.isCreatedByUser || message?.role?.toLowerCase() === 'user' ? this.userLabel : this.chatGptLabel;
        const messageString = `${this.startToken}${roleLabel}:\n${message?.text ?? message?.message}${this.endToken}\n`;
        let newPromptBody;
        if (promptBody || isChatGptModel) {
          newPromptBody = `${messageString}${promptBody}`;
        } else {
          // Always insert prompt prefix before the last user message, if not gpt-3.5-turbo.
          // This makes the AI obey the prompt instructions better, which is important for custom instructions.
          // After a bunch of testing, it doesn't seem to cause the AI any confusion, even if you ask it things
          // like "what's the last thing I wrote?".
          newPromptBody = `${promptPrefix}${messageString}${promptBody}`;
        }

        context.unshift(message);

        const tokenCountForMessage = this.getTokenCount(messageString);
        const newTokenCount = currentTokenCount + tokenCountForMessage;
        if (newTokenCount > maxTokenCount) {
          if (promptBody) {
            // This message would put us over the token limit, so don't add it.
            return false;
          }
          // This is the first message, so we can't add it. Just throw an error.
          throw new Error(`Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`);
        }
        promptBody = newPromptBody;
        currentTokenCount = newTokenCount;
        // wait for next tick to avoid blocking the event loop
        await new Promise(resolve => setImmediate(resolve));
        return buildPromptBody();
      }
      return true;
    };

    await buildPromptBody();

    const prompt = `${promptBody}${promptSuffix}`;
    if (isChatGptModel) {
      messagePayload.content = prompt;
      // Add 2 tokens for metadata after all messages have been counted.
      currentTokenCount += 2;
    }

    // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    this.modelOptions.max_tokens = Math.min(this.maxContextTokens - currentTokenCount, this.maxResponseTokens);

    if (this.options.debug) {
      console.debug(`Prompt : ${prompt}`);
    }

    if (isChatGptModel) {
      return { prompt: [instructionsPayload, messagePayload], context };
    }
    return { prompt, context };
  }

  getTokenCount(text) {
    return this.gptEncoder.encode(text, 'all').length;
  }

  /**
 * Algorithm adapted from "6. Counting tokens for chat API calls" of
 * https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
 *
 * An additional 2 tokens need to be added for metadata after all messages have been counted.
 *
 * @param {*} message
 */
  getTokenCountForMessage(message) {
    let tokensPerMessage;
    let nameAdjustment;
    if (this.modelOptions.model.startsWith('gpt-4')) {
      tokensPerMessage = 3;
      nameAdjustment = 1;
    } else {
      tokensPerMessage = 4;
      nameAdjustment = -1;
    }

    // Map each property of the message to the number of tokens it contains
    const propertyTokenCounts = Object.entries(message).map(([key, value]) => {
      // Count the number of tokens in the property value
      const numTokens = this.getTokenCount(value);

      // Adjust by `nameAdjustment` tokens if the property key is 'name'
      const adjustment = (key === 'name') ? nameAdjustment : 0;
      return numTokens + adjustment;
    });

    // Sum the number of tokens in all properties and add `tokensPerMessage` for metadata
    return propertyTokenCounts.reduce((a, b) => a + b, tokensPerMessage);
  }
}

module.exports = ChatGPTClient;