const { ChatOpenAI } = require('langchain/chat_models/openai');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { CallbackManager } = require('langchain/callbacks');
const { initializeAgentExecutor } = require('langchain/agents');
const { SerpAPI } = require('langchain/tools');
const { Calculator } = require('langchain/tools/calculator');
const { WebBrowser } = require('langchain/tools/webbrowser');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const { HumanChatMessage, AIChatMessage } = require('langchain/schema');
const { getMessages, saveMessage, saveConvo } = require('../../models');
const crypto = require('crypto');

class ChatAgent {
  constructor(apiKey, options = {}) {
    this.openAIApiKey = apiKey;
    this.executor = null;
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

    const modelOptions = this.options.modelOptions || {};
    this.modelOptions = {
      ...modelOptions,
      // set some good defaults (check for undefined in some cases because they may be 0)
      model: modelOptions.model || 'gpt-3.5-turbo',
      // all langchain examples have temp set to 0
      temperature: typeof modelOptions.temperature === 'undefined' ? 0 : modelOptions.temperature,
      top_p: typeof modelOptions.top_p === 'undefined' ? 1 : modelOptions.top_p,
      presence_penalty:
        typeof modelOptions.presence_penalty === 'undefined' ? 1 : modelOptions.presence_penalty,
      stop: modelOptions.stop
    };

    // this.isChatGptModel = this.modelOptions.model.startsWith('gpt-');
    // // Davinci models have a max context length of 4097 tokens.
    // this.maxContextTokens = this.options.maxContextTokens || 4095;
    // // I decided to reserve 1024 tokens for the response.
    // // The max prompt tokens is determined by the max context tokens minus the max response tokens.
    // // Earlier messages will be dropped until the prompt is within the limit.
    // this.maxResponseTokens = this.modelOptions.max_tokens || 1024;
    // this.maxPromptTokens = this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    // if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
    //   throw new Error(
    //     `maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
    //       this.maxPromptTokens + this.maxResponseTokens
    //     }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`
    //   );
    // }
  }

  async loadHistory(conversationId) {
    // const conversation = await Conversation.findOne({ _id: conversationId }).populate('messages');
    const messages = (await getMessages({ conversationId })) || [];

    if (messages.length === 0) {
      return [];
    }

    // Convert Message documents into appropriate ChatMessage instances
    const chatMessages = messages.map((msg) =>
      msg.isCreatedByUser ? new HumanChatMessage(msg.text) : new AIChatMessage(msg.text)
    );

    return chatMessages;
  }

  async saveMessageToDatabase(message, user = null) {
    await saveMessage(message);
    await saveConvo(user, { conversationId: message.conversationId });
  }

  async initialize(conversationId, user) {
    const model = new ChatOpenAI({
      openAIApiKey: this.openAIApiKey,
      streaming: true,
      callbackManager: CallbackManager.fromHandlers({
        async handleLLMNewToken(token) {
          console.log({ token });
        },
      }),
      ...this.modelOptions
    });
    const tools = [new Calculator(), new WebBrowser({ model, embeddings: new OpenAIEmbeddings() })];

    if (this.options.serpapiApiKey) {
      tools.push(
        new SerpAPI(this.options.serpapiApiKey, {
          location: 'Austin,Texas,United States',
          hl: 'en',
          gl: 'us'
        })
      );
    }

    const pastMessages = await this.loadHistory(conversationId, user);
    this.executor = await initializeAgentExecutor(
      tools,
      model,
      // 'chat-conversational-react-description',
      'chat-zero-shot-react-description',
      true
    );

    this.executor.memory = new BufferMemory({
      chatHistory: new ChatMessageHistory(pastMessages),
      returnMessages: true,
      memoryKey: 'chat_history',
      inputKey: 'input',
      outputKey: 'output'
    });

    console.log('Loaded agent.');
  }

  async sendMessage(message, opts = {}) {
    if (opts.clientOptions && typeof opts.clientOptions === 'object') {
      this.setOptions(opts.clientOptions);
    }

    const user = opts.user || null;
    const conversationId = opts.conversationId || crypto.randomUUID();
    const parentMessageId = opts.parentMessageId || '00000000-0000-0000-0000-000000000000';
    await this.initialize(conversationId, user);

    // let conversation = await this.conversationsCache.get(conversationId);
    // let isNewConversation = false;
    // if (!conversation) {
    //   conversation = {
    //     messages: [],
    //     createdAt: Date.now()
    //   };
    //   isNewConversation = true;
    // }
    // const shouldGenerateTitle = opts.shouldGenerateTitle && isNewConversation;

    const userMessage = {
      messageId: crypto.randomUUID(),
      parentMessageId,
      conversationId,
      sender: 'User',
      text: message,
      isCreatedByUser: true
    };

    this.saveMessageToDatabase(userMessage, user);

    let reply = '';
    let result = await this.executor.call({ input: message });
    reply = result.output.trim();

    const replyMessage = {
      messageId: crypto.randomUUID(),
      conversationId,
      parentMessageId: userMessage.messageId,
      sender: 'ChatGPT',
      text: reply,
      isCreatedByUser: false
    };

    this.saveMessageToDatabase(replyMessage, user);

    // if (shouldGenerateTitle) {
    //   conversation.title = await this.generateTitle(userMessage, replyMessage);
    //   returnData.title = conversation.title;
    // }

    // await this.conversationsCache.set(conversationId, conversation);

    return { ...replyMessage, details: result };
  }
}

module.exports = ChatAgent;
