const ChatGPTClient = require('./ChatGPTClient');

class OpenAIClient extends ChatGPTClient {
  constructor(apiKey, options, cacheOptions) {
    super(apiKey, options, cacheOptions);
    this.isChatCompletion = this.options.reverseProxyUrl || this.options.localAI || this.isChatGptModel;
    if (this.modelOptions.model === 'text-davinci-003') {
      this.isChatCompletion = false;
    }
  }

  async sendMessage(message, opts = {}) {
    if (opts && typeof opts === 'object') {
      this.setOptions(opts);
    }
    console.log('sendMessage', message, opts);

    const user = opts.user || null;
    const conversationId = opts.conversationId || crypto.randomUUID();
    const parentMessageId = opts.parentMessageId || '00000000-0000-0000-0000-000000000000';
    const userMessageId = opts.overrideParentMessageId || crypto.randomUUID();
    const responseMessageId = crypto.randomUUID();
    const currentMessages = await this.loadHistory(conversationId, parentMessageId) ?? [];
    const saveOptions = { 
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      ...this.modelOptions
    };

    const userMessage = {
      messageId: userMessageId,
      parentMessageId,
      conversationId,
      sender: 'User',
      text: message,
      isCreatedByUser: true
    };

    if (this.options.debug) {
      console.debug('currentMessages', currentMessages);
    }

    if (typeof opts?.getIds === 'function') {
      opts.getIds({
        userMessage,
        conversationId,
        responseMessageId
      });
    }

    if (typeof opts?.onStart === 'function') {
      opts.onStart(userMessage);
    }

    await this.saveMessageToDatabase(userMessage, saveOptions, user);

    const responseMessage = {
      messageId: responseMessageId,
      conversationId,
      parentMessageId: userMessage.messageId,
      isCreatedByUser: false,
      model: this.modelOptions.model,
      sender: 'ChatGPT'
    };

    if (this.options.debug) {
      console.debug('options');
      console.debug(this.options);
    }

    currentMessages.push(userMessage);
    const { prompt: payload } = await this.buildPrompt(
      currentMessages,
      userMessage.messageId,
      {
        isChatCompletion: this.isChatCompletion,
        promptPrefix: opts.promptPrefix,
      },
    );

    if (this.options.debug) {
      console.debug('payload');
      console.debug(payload);
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

    reply = reply.trim();
    responseMessage.text = reply;
    await this.saveMessageToDatabase(responseMessage, saveOptions, user);
    return { ...responseMessage, ...this.result };
  }

  async buildPrompt(messages, parentMessageId, { isChatCompletion = false, promptPrefix = null }) {
    if (!isChatCompletion) {
      return await super.buildPrompt(messages, parentMessageId, { isChatGptModel: isChatCompletion, promptPrefix });
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

}

module.exports = OpenAIClient;
