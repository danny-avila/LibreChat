// const { ChatGPTClient } = import('@waylaidwanderer/chatgpt-api');
const ChatGPTClient = require('./ChatGPTClient');

class OpenAIClient extends ChatGPTClient {
  constructor(apiKey, options, cacheOptions) {
    super(apiKey, options, cacheOptions);
  }

  async buildPrompt(messages, parentMessageId, { isChatGptModel = false, promptPrefix = null }) {
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
      let { role, message: msg } = message;
      const formattedMessage = {
        role: role?.toLowerCase() === 'user' ? 'user' : 'assistant',
        content: msg ?? '',
      };

      if (this.options?.name && formattedMessage.role === 'user' ) {
        formattedMessage.name = this.options.name;
      }
    
      return formattedMessage;
    });    

    const context = [];
    payload.push(...formattedMessages);

    if (isChatGptModel || this.options.reverseProxyUrl) {
      // return { prompt: [instructionsPayload, ...orderedMessages], context };
      return { prompt: payload, context };
    }
    
    return { prompt, context };
  }

}

module.exports = OpenAIClient;
