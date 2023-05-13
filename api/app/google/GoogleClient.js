const crypto = require('crypto');
const TextStream = require('../stream');
const { google } = require('googleapis');
const { Agent, ProxyAgent } = require('undici');
const { getMessages, saveMessage, saveConvo } = require('../../models');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('@dqbd/tiktoken');

const tokenizersCache = {};

class GoogleAgent {
  constructor(credentials, options = {}) {
    this.client_email = credentials.client_email;
    this.project_id = credentials.project_id;
    this.private_key = credentials.private_key;
    this.setOptions(options);
    this.currentDateString = new Date().toLocaleDateString('en-us', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  constructUrl() {
    return `https://us-central1-aiplatform.googleapis.com/v1/projects/${this.project_id}/locations/us-central1/publishers/google/models/${this.modelOptions.model}:predict`;
  }

  setOptions(options) {
    if (this.options && !this.options.replaceOptions) {
      // nested options aren't spread properly, so we need to do this manually
      this.options.modelOptions = {
        ...this.options.modelOptions,
        ...options.modelOptions
      };
      delete options.modelOptions;
      // now we can merge options
      this.options = {
        ...this.options,
        ...options
      };
    } else {
      this.options = options;
    }

    this.options.examples = this.options.examples.filter(
      obj => obj.input.content !== '' && obj.output.content !== ''
    );

    const modelOptions = this.options.modelOptions || {};
    this.modelOptions = {
      ...modelOptions,
      // set some good defaults (check for undefined in some cases because they may be 0)
      model: modelOptions.model || 'chat-bison',
      temperature: typeof modelOptions.temperature === 'undefined' ? 0.2 : modelOptions.temperature, // 0 - 1, 0.2 is recommended
      topP: typeof modelOptions.topP === 'undefined' ? 0.95 : modelOptions.topP, // 0 - 1, default: 0.95
      topK: typeof modelOptions.topK === 'undefined' ? 40 : modelOptions.topK // 1-40, default: 40
      // stop: modelOptions.stop // no stop method for now
    };

    this.isChatModel = this.modelOptions.model.startsWith('chat-');
    const { isChatModel } = this;
    this.isTextModel = this.modelOptions.model.startsWith('text-');
    const { isTextModel } = this;

    this.maxContextTokens = this.options.maxContextTokens || (isTextModel ? 8000 : 4096);
    // The max prompt tokens is determined by the max context tokens minus the max response tokens.
    // Earlier messages will be dropped until the prompt is within the limit.
    this.maxResponseTokens = this.modelOptions.maxOutputTokens || 1024;
    this.maxPromptTokens = this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + maxOutputTokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`
      );
    }

    this.userLabel = this.options.userLabel || 'User';
    this.modelLabel = this.options.modelLabel || 'Assistant';

    if (isChatModel) {
      // Use these faux tokens to help the AI understand the context since we are building the chat log ourselves.
      // Trying to use "<|im_start|>" causes the AI to still generate "<" or "<|" at the end sometimes for some reason,
      // without tripping the stop sequences, so I'm using "||>" instead.
      this.startToken = '||>';
      this.endToken = '';
      this.gptEncoder = this.constructor.getTokenizer('cl100k_base');
    } else if (isTextModel) {
      this.startToken = '<|im_start|>';
      this.endToken = '<|im_end|>';
      this.gptEncoder = this.constructor.getTokenizer('text-davinci-003', true, {
        '<|im_start|>': 100264,
        '<|im_end|>': 100265
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

  async getClient() {
    const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
    const jwtClient = new google.auth.JWT(this.client_email, null, this.private_key, scopes);

    jwtClient.authorize((err) => {
      if (err) {
        console.log(err);
        throw err;
      }
    });

    return jwtClient;
  }

  buildPayload(input, { messages = [] }) {
    let payload = {
      instances: [
        {
          messages: [...messages, { author: this.userLabel, content: input }]
        }
      ],
      parameters: this.options.modelOptions
    };

    if (this.options.promptPrefix) {
      payload.instances[0].context = this.options.promptPrefix;
    }

    if (this.options.examples.length > 0) {
      payload.instances[0].examples = this.options.examples;
    }

    if (this.isTextModel) {
      payload.instances = [
        {
          prompt: input
        }
      ];
    }

    if (this.options.debug) {
      console.debug('buildPayload');
      console.dir(payload, { depth: null });
    }

    return payload;
  }

  async getCompletion(input, messages = [], abortController = null) {
    if (!abortController) {
      abortController = new AbortController();
    }
    const { debug } = this.options;
    const url = this.completionsUrl;
    if (debug) {
      console.debug();
      console.debug(url);
      console.debug(this.modelOptions);
      console.debug();
    }
    const opts = {
      method: 'POST',
      agent: new Agent({
        bodyTimeout: 0,
        headersTimeout: 0
      }),
      signal: abortController.signal
    };

    if (this.options.proxy) {
      opts.agent = new ProxyAgent(this.options.proxy);
    }

    const client = await this.getClient();
    const payload = this.buildPayload(input, { messages });
    const res = await client.request({ url, method: 'POST', data: payload });
    console.dir(res.data, { depth: null });
    return res.data;
  }

  async loadHistory(conversationId, parentMessageId = null) {
    if (this.options.debug) {
      console.debug('Loading history for conversation', conversationId, parentMessageId);
    }

    if (!parentMessageId) {
      return [];
    }

    const messages = (await getMessages({ conversationId })) || [];

    if (messages.length === 0) {
      this.currentMessages = [];
      return [];
    }

    const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);
    return orderedMessages.map((message) => {
      return {
        author: message.isCreatedByUser ? this.userLabel : this.modelLabel,
        content: message.content
      };
    });
  }

  async saveMessageToDatabase(message, user = null) {
    await saveMessage({ ...message, unfinished: false });
    await saveConvo(user, {
      conversationId: message.conversationId,
      endpoint: 'google',
      ...this.modelOptions
    });
  }

  async sendMessage(message, opts = {}) {
    if (opts && typeof opts === 'object') {
      this.setOptions(opts);
    }
    console.log('sendMessage', message, opts);

    const user = opts.user || null;
    const conversationId = opts.conversationId || crypto.randomUUID();
    const parentMessageId = opts.parentMessageId || '00000000-0000-0000-0000-000000000000';
    const userMessageId = crypto.randomUUID();
    const responseMessageId = crypto.randomUUID();
    const messages = await this.loadHistory(conversationId, this.options?.parentMessageId);

    const userMessage = {
      messageId: userMessageId,
      parentMessageId,
      conversationId,
      sender: 'User',
      text: message,
      isCreatedByUser: true
    };

    if (typeof opts?.getIds === 'function') {
      opts.getIds({
        userMessage,
        conversationId,
        responseMessageId
      });
    }

    console.log('userMessage', userMessage);

    await this.saveMessageToDatabase(userMessage, user);
    let reply = '';
    let blocked = false;
    try {
      const result = await this.getCompletion(message, messages, opts.abortController);
      blocked = result?.predictions?.[0]?.safetyAttributes?.blocked;
      reply = result?.predictions?.[0]?.candidates?.[0]?.content || result?.predictions?.[0]?.content || '';
      if (blocked === true) {
        reply = `Google blocked a proper response to your message:\n${JSON.stringify(
          result.predictions[0].safetyAttributes
        )}${reply.length > 0 ? `\nAI Response:\n${reply}` : ''}`;
      }
      if (this.options.debug) {
        console.debug('result');
        console.debug(result);
      }
    } catch (err) {
      console.error(err);
    }

    if (this.options.debug) {
      console.debug('options');
      console.debug(this.options);
    }

    if (!blocked) {
      const textStream = new TextStream(reply, { delay: 0.5 });
      await textStream.processTextStream(opts.onProgress);
    }

    const responseMessage = {
      messageId: responseMessageId,
      conversationId,
      parentMessageId: userMessage.messageId,
      sender: 'PaLM2',
      text: reply,
      error: blocked,
      isCreatedByUser: false
    };

    await this.saveMessageToDatabase(responseMessage, user);
    return responseMessage;
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
    // Map each property of the message to the number of tokens it contains
    const propertyTokenCounts = Object.entries(message).map(([key, value]) => {
      // Count the number of tokens in the property value
      const numTokens = this.getTokenCount(value);

      // Subtract 1 token if the property key is 'name'
      const adjustment = key === 'name' ? 1 : 0;
      return numTokens - adjustment;
    });

    // Sum the number of tokens in all properties and add 4 for metadata
    return propertyTokenCounts.reduce((a, b) => a + b, 4);
  }

  /**
   * Iterate through messages, building an array based on the parentMessageId.
   * Each message has an id and a parentMessageId. The parentMessageId is the id of the message that this message is a reply to.
   * @param messages
   * @param parentMessageId
   * @returns {*[]} An array containing the messages in the order they should be displayed, starting with the root message.
   */
  static getMessagesForConversation(messages, parentMessageId) {
    const orderedMessages = [];
    let currentMessageId = parentMessageId;
    while (currentMessageId) {
      // eslint-disable-next-line no-loop-func
      const message = messages.find(m => m.messageId === currentMessageId);
      if (!message) {
        break;
      }
      orderedMessages.unshift(message);
      currentMessageId = message.parentMessageId;
    }

    if (orderedMessages.length === 0) {
      return [];
    }

    return orderedMessages.map(msg => ({
      isCreatedByUser: msg.isCreatedByUser,
      content: msg.text
    }));
  }
}

module.exports = GoogleAgent;
