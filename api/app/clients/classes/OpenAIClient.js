const BaseClient = require('./BaseClient');
const ChatGPTClient = require('./ChatGPTClient');

class OpenAIClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.ChatGPTClient = new ChatGPTClient();
    this.setOptions = this.ChatGPTClient.setOptions.bind(this);
    this.getCompletion = this.ChatGPTClient.getCompletion.bind(this);
    this.getTokenCountForMessage = this.ChatGPTClient.getTokenCountForMessage.bind(this);
    this.buildPromptMessage = this.ChatGPTClient.buildPrompt.bind(this);
    this.sender = options.sender || 'ChatGPT';
    this.setOptions(options);
    this.isChatCompletion = this.options.reverseProxyUrl || this.options.localAI || this.isChatGptModel;
    this.isChatGptModel = this.isChatCompletion;
    if (this.modelOptions.model === 'text-davinci-003') {
      this.isChatCompletion = false;
      this.isChatGptModel = false;
    }
  }

  setupTokens() {
    this.ChatGPTClient.setupTokens();
  }

  setupTokenizer() {
    this.ChatGPTClient.setupTokenizer();
  }

  getTokenizer() {
    this.gptEncoder = this.ChatGPTClient.getTokenizer(this.modelOptions.model, true);
  }

  getTokenCount(text) {
    return this.ChatGPTClient.getTokenCount(text);
  }

  getTokenCountForMessage(message) {
    return this.ChatGPTClient.getTokenCountForMessage(message);
  }

  getSaveOptions() {
    return {
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      ...this.modelOptions
    };
  }

  getBuildPromptOptions(opts) {
    return {
      isChatCompletion: this.isChatCompletion,
      promptPrefix: opts.promptPrefix,
    };
  }

  async buildPrompt(messages, parentMessageId, { isChatCompletion = false, promptPrefix = null }) {
    if (!isChatCompletion) {
      return await this.buildPromptMessage(messages, parentMessageId, { isChatGptModel: isChatCompletion, promptPrefix });
    }

    const payload = [];
    const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);

    promptPrefix = (promptPrefix || this.options.promptPrefix || '').trim();
    if (promptPrefix) {
      promptPrefix = `Instructions:\n${promptPrefix}`;
      payload.push({
        role: 'system',
        name: 'instructions',
        content: promptPrefix,
      });
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

    payload.push(...formattedMessages);

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
          const token = this.isChatCompletion ? progressMessage.choices[0].delta?.content : progressMessage.choices[0].text;
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
