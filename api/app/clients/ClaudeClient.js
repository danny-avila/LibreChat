const Keyv = require('keyv');
const BaseClient = require('./BaseClient');
// const { Agent, ProxyAgent } = require('undici');
const {
  encoding_for_model: encodingForModel,
  get_encoding: getEncoding
} = require('@dqbd/tiktoken');

const Anthropic = require('@anthropic-ai/sdk');

const HUMAN_PROMPT = "\n\nHuman:";
const AI_PROMPT = "\n\nAssistant:";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-1";
// const DEFAULT_API_URL = "https://api.anthropic.com";

// const DONE_MESSAGE = "[DONE]";

const tokenizersCache = {};

class ClaudeClient extends BaseClient {

  constructor(apiKey, options = {}, cacheOptions = {}) {
    super(apiKey, options, cacheOptions)
    cacheOptions.namespace = cacheOptions.namespace || 'claude';
    this.conversationsCache = new Keyv(cacheOptions);
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    this.sender = "Claude";
    this.setOptions(options);
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

    // this.options.examples = this.options.examples.filter(
    //   (obj) => obj.input.content !== '' && obj.output.content !== ''
    // );

    const modelOptions = this.options.modelOptions || {};
    this.modelOptions = {
      ...modelOptions,
      // set some good defaults (check for undefined in some cases because they may be 0)
      model: modelOptions.model || CLAUDE_MODEL || 'claude-1',
      temperature: typeof modelOptions.temperature === 'undefined' ? 0.2 : modelOptions.temperature, // 0 - 1, 0.2 is recommended
      topP: typeof modelOptions.topP === 'undefined' ? 0.95 : modelOptions.topP, // 0 - 1, default: 0.95
      topK: typeof modelOptions.topK === 'undefined' ? 40 : modelOptions.topK, // 1-40, default: 40
      stop: modelOptions.stop // no stop method for now
    };

    this.maxContextTokens = this.options.maxContextTokens || 16000;

    if(this.modelOptions.model.endsWith('100k')) {
      this.maxContextTokens = 100000;
    }

    this.maxResponseTokens = this.modelOptions.maxOutputTokens || 1024;
    this.maxPromptTokens =
      this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + maxOutputTokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`
      );
    }

    this.userLabel = this.options.userLabel || HUMAN_PROMPT;
    this.assistantLabel = this.options.modelLabel || AI_PROMPT;

    this.startToken = '||>';
    this.endToken = '';
    this.gptEncoder = this.constructor.getTokenizer('cl100k_base');

    if (!this.modelOptions.stop) {
      const stopTokens = [this.startToken];
      if (this.endToken && this.endToken !== this.startToken) {
        stopTokens.push(this.endToken);
      }
      stopTokens.push(`\n${this.userLabel}:`);
      stopTokens.push('<|diff_marker|>');

      this.modelOptions.stop = stopTokens;
    }

    // if (this.options.reverseProxyUrl) {
    //   this.completionsUrl = this.options.reverseProxyUrl;
    // } else {
    //   this.completionsUrl = DEFAULT_API_URL
    // }

    return this;
  }

  getClient() {
    const client = new Anthropic({
      apiKey: this.apiKey,
    });

    return client;
  };

  async buildPrompt(messages, parentMessageId) {
    console.log('ClaudeClient: buildPrompt', messages, parentMessageId);
    const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);

    let promptPrefix = (this.options.promptPrefix || '').trim();
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
      promptPrefix = `${this.startToken}Instructions:\nYou are Claude, a large language model trained by Anthropic. Respond conversationally.\nCurrent date: ${currentDateString}${this.endToken}\n\n`;
    }

    const promptSuffix = `${this.startToken}${this.AI_PROMPT}:\n`; // Prompt ChatGPT to respond.

    const instructionsPayload = {
      role: 'system',
      name: 'instructions',
      content: promptPrefix,
    };

    const messagePayload = {
      role: 'system',
      content: promptSuffix,
    };

    let currentTokenCount = currentTokenCount = this.getTokenCount(`${promptPrefix}${promptSuffix}`);

    let promptBody = '';
    const maxTokenCount = this.maxPromptTokens;

    const context = [];

    // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    // Do this within a recursive async function so that it doesn't block the event loop for too long.
    const buildPromptBody = async () => {
      if (currentTokenCount < maxTokenCount && orderedMessages.length > 0) {
        const message = orderedMessages.pop();
        const roleLabel = message?.isCreatedByUser || message?.role?.toLowerCase() === 'user' ? this.HUMAN_PROMPT : this.AI_PROMPT;
        const messageString = `${this.startToken}${roleLabel}:\n${message?.text ?? message?.message}${this.endToken}\n`;
        let newPromptBody;
        if (promptBody) {
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
    messagePayload.content = prompt;
    // Add 2 tokens for metadata after all messages have been counted.
    currentTokenCount += 2;

    // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    this.modelOptions.max_tokens = Math.min(this.maxContextTokens - currentTokenCount, this.maxResponseTokens);

    if (this.options.debug) {
      console.debug(`Prompt : ${prompt}`);
    }

    return { prompt: [instructionsPayload, messagePayload], context };
    //return { prompt, context };
  }

  async getCompletion(payload, abortController = null) {
    console.log('ClaudeClient: getCompletion', payload)
    if (!abortController) {
      abortController = new AbortController();
    }

    const { debug } = this.options;
    if (debug) {
      console.debug();
      console.debug(this.modelOptions);
      console.debug();
    }
    // const opts = {
    //   method: 'POST',
    //   agent: new Agent({
    //     bodyTimeout: 0,
    //     headersTimeout: 0
    //   }),
    //   signal: abortController.signal
    // };

    // if (this.options.proxy) {
    //   opts.agent = new ProxyAgent(this.options.proxy);
    // }

    const client = this.getClient();

    const response = await client.completions.create({
      // prompt: `${Anthropic.HUMAN_PROMPT} ${input} ${Anthropic.AI_PROMPT}`,
      prompt: payload,
      //just temporarily hard-coding this to claude-1
      model: 'claude-1',
      // Not sure if this should be set to true or not
      // stream: true,
      // I think this should be this.maxPropmtTokens, but not 100% sure
      max_tokens_to_sample: 300,

      //  temporarily commented out for debugging
      //...this.modelOptions
    });

    console.dir(response, { depth: null });
    return response;
  }

  getMessageMapMethod() {
    return ((message) => ({
      author: message.isCreatedByUser ? this.userLabel : this.modelLabel,
      content: message?.content ?? message.text
    })).bind(this);
  }

  getSaveOptions() {
    return {
      ...this.modelOptions
    };
  }

  getBuildMessagesOptions() {
    console.log('ClaudeClient doesn\'t use getBuildMessagesOptions');
  }

  async sendMessage(message, opts = {}) {
    console.log('ClaudeClient: sendMessage', message, opts);
    const {
      user,
      conversationId,
      responseMessageId,
      saveOptions,
      userMessage,
    } = await this.handleStartMethods(message, opts);

    await this.saveMessageToDatabase(userMessage, saveOptions, user);

    let conversation = typeof opts.conversation === 'object'
      ? opts.conversation
      : await this.conversationsCache.get(conversationId);

    // let isNewConversation = false;
    if (!conversation) {
      conversation = {
        messages: [],
        createdAt: Date.now(),
      };
      // isNewConversation = true;
    }

    // const shouldGenerateTitle = opts.shouldGenerateTitle && isNewConversation;

    conversation.messages.push(userMessage);

    const { prompt: payload, context } = await this.buildPrompt(
      conversation.messages,
      userMessage.id,
      opts.promptPrefix,
    );

    if (this.options.keepNecessaryMessagesOnly) {
      conversation.messages = context;
    }

    let reply = '';

    try {
      reply = await this.getCompletion(payload, opts.abortController);

      if (this.options.debug) {
        console.debug('result');
        console.debug(reply);
      }
    } catch (err) {
      console.error(err);
    }

    if (this.options.debug) {
      console.debug('options');
      console.debug(this.options);
    }

    await this.generateTextStream(reply, opts.onProgress, { delay: 0.5 });

    const responseMessage = {
      messageId: responseMessageId,
      conversationId,
      parentMessageId: userMessage.messageId,
      sender: this.sender,
      text: reply,
      isCreatedByUser: false
    };

    await this.saveMessageToDatabase(responseMessage, saveOptions, user);
    return responseMessage;
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

  getTokenCount(text) {
    return this.gptEncoder.encode(text, 'all').length;
  }
}

module.exports = ClaudeClient;
