const Keyv = require('keyv');
// const { Agent, ProxyAgent } = require('undici');
const BaseClient = require('./BaseClient');
const {
  encoding_for_model: encodingForModel,
  get_encoding: getEncoding
} = require('@dqbd/tiktoken');
const Anthropic = require('@anthropic-ai/sdk');

const HUMAN_PROMPT = "\n\nHuman";
const AI_PROMPT = "\n\nAssistant";

const tokenizersCache = {};

class AnthropicClient extends BaseClient {

  constructor(apiKey, options = {}, cacheOptions = {}) {
    super(apiKey, options, cacheOptions)
    cacheOptions.namespace = cacheOptions.namespace || 'anthropic';
    this.conversationsCache = new Keyv(cacheOptions);
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    this.sender = "Anthropic";
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
        ...options,
        debug: true
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
      model: modelOptions.model || 'claude-1',
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

  async buildMessages(messages, parentMessageId) {
    const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);
    if (this.options.debug) {
      console.debug('AnthropicClient: orderedMessages', orderedMessages, parentMessageId);
    }

    const formattedMessages = orderedMessages.map((message) => ({
      author: message.isCreatedByUser ? this.userLabel : this.assistantLabel,
      content: message?.content ?? message.text
    }));

    const defaultPrefix = `\nRemember your instructions:\nYou are Claude, a large language model trained by Anthropic. Respond conversationally.\nCurrent date: ${this.currentDateString}${this.endToken}`

    let promptPrefix = (this.options.promptPrefix || '').trim();
    if (promptPrefix) {
      // If the prompt prefix doesn't end with the end token, add it.
      if (!promptPrefix.endsWith(`${this.endToken}`)) {
        promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
      }
      promptPrefix = `\nRemember your instructions:\n${promptPrefix}`;
    } else {
      promptPrefix = defaultPrefix;
    }

    const promptSuffix = `${promptPrefix}${this.assistantLabel}:\n`; // Prompt AI to respond.
    let currentTokenCount = this.getTokenCount(promptSuffix);

    let promptBody = '';
    const maxTokenCount = this.maxPromptTokens;

    const context = [];

    // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    // Do this within a recursive async function so that it doesn't block the event loop for too long.
    const buildPromptBody = async () => {
      if (currentTokenCount < maxTokenCount && formattedMessages.length > 0) {
        const message = formattedMessages.pop();
        const roleLabel = message.author;
        const messageString = `${roleLabel}:\n${message.content}${this.endToken}\n`;
        let newPromptBody = `${messageString}${promptBody}`;

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
    if (this.options.debug) {
      console.debug(prompt);
    }
    // Add 2 tokens for metadata after all messages have been counted.
    currentTokenCount += 2;

    // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    this.modelOptions.max_tokens = Math.min(this.maxContextTokens - currentTokenCount, this.maxResponseTokens);

    return { prompt, context };
  }

  getCompletion() {
    console.log('AnthropicClient doesn\'t use getCompletion (all handled in sendCompletion)');
  }

  // TODO: implement abortController usage
  async sendCompletion(payload, { onProgress, abortController }) {
    if (!abortController) {
      abortController = new AbortController();
    }
    console.log('AnthropicClient: getCompletion', payload);
    // const { signal } = abortController;

    const modelOptions = { ...this.modelOptions };
    if (typeof onProgress === 'function') {
      modelOptions.stream = true;
    }

    const { debug } = this.options;
    if (debug) {
      console.debug();
      console.debug(modelOptions);
      console.debug();
    }

    // TODO: We should support proxies/aborting
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

    let text = '';

    const response = await client.completions.create({
      prompt: payload,
      model: this.modelOptions.model,
      stream: this.modelOptions.stream || true,
      max_tokens_to_sample: this.modelOptions.maxOutputTokens || 1024,
      ...modelOptions
    });

    for await (const completion of response) {
      if (this.options.debug) {
        console.debug(completion);
      }
      // signal.addEventListener('abort', () => {
      //   console.log('AnthropicClient: aborting');
      //   return;
      // });
      text += completion.completion;
      onProgress(completion.completion);
    }

    // signal.removeEventListener('abort');
    return text.trim();
  }

  // I commented this out because I will need to refactor this for the BaseClient/all clients
  // getMessageMapMethod() {
  //   return ((message) => ({
  //     author: message.isCreatedByUser ? this.userLabel : this.assistantLabel,
  //     content: message?.content ?? message.text
  //   })).bind(this);
  // }

  getSaveOptions() {
    return {
      ...this.modelOptions
    };
  }

  getBuildMessagesOptions() {
    console.log('AnthropicClient doesn\'t use getBuildMessagesOptions');
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

module.exports = AnthropicClient;
