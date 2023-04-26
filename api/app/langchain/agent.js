const crypto = require('crypto');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('@dqbd/tiktoken');
const { fetchEventSource } = require('@waylaidwanderer/fetch-event-source');
const { Agent, ProxyAgent } = require('undici');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { CallbackManager } = require('langchain/callbacks');
const { ZapierToolKit } = require('langchain/agents');
const { SerpAPI, ZapierNLAWrapper } = require('langchain/tools');
const { Calculator } = require('langchain/tools/calculator');
const { WebBrowser } = require('langchain/tools/webbrowser');
const { HumanChatMessage, AIChatMessage } = require('langchain/schema');
// const { HumanTool } = require('./tools/HumanTool');
const { initializeCustomAgent } = require('./customAgent');
const { getMessages, saveMessage, saveConvo } = require('../../models');

const tokenizersCache = {};

class CustomChatAgent {
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
        ...options,
        debug: true
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

    this.isChatGptModel = this.modelOptions.model.startsWith('gpt-');
    // Davinci models have a max context length of 4097 tokens.
    this.maxContextTokens = this.options.maxContextTokens || 4095;
    // I decided to reserve 1024 tokens for the response.
    // The max prompt tokens is determined by the max context tokens minus the max response tokens.
    // Earlier messages will be dropped until the prompt is within the limit.
    this.maxResponseTokens = this.modelOptions.max_tokens || 1024;
    this.maxPromptTokens = this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`
      );
    }

    this.userLabel = this.options.userLabel || 'User';
    this.chatGptLabel = this.options.chatGptLabel || 'ChatGPT';

    // Use these faux tokens to help the AI understand the context since we are building the chat log ourselves.
    // Trying to use "<|im_start|>" causes the AI to still generate "<" or "<|" at the end sometimes for some reason,
    // without tripping the stop sequences, so I'm using "||>" instead.
    this.startToken = '||>';
    this.endToken = '';
    this.gptEncoder = this.constructor.getTokenizer('cl100k_base');
    this.completionsUrl = 'https://api.openai.com/v1/chat/completions';

    if (this.options.reverseProxyUrl) {
      this.completionsUrl = this.options.reverseProxyUrl;
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

  async getCompletion(input, onProgress, abortController = null) {
    if (!abortController) {
      abortController = new AbortController();
    }
    const modelOptions = { ...this.modelOptions, temperature: 1 };
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(modelOptions),
      dispatcher: new Agent({
        bodyTimeout: 0,
        headersTimeout: 0
      })
    };
    if (this.openAIApiKey) {
      opts.headers.Authorization = `Bearer ${this.openAIApiKey}`;
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
                console.debug(message);
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
            }
          });
        } catch (err) {
          reject(err);
        }
      });
    }
    const response = await fetch(url, {
      ...opts,
      signal: abortController.signal
    });
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

  async loadHistory(conversationId, parentMessageId = null) {
    // const conversation = await Conversation.findOne({ _id: conversationId }).populate('messages');
    if (this.options.debug) {
      console.debug('Loading history for conversation', conversationId, parentMessageId);
    }

    const messages = (await getMessages({ conversationId })) || [];

    if (messages.length === 0) {
      this.currentMessages = [];
      return [];
    }

    const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);

    if (this.options.debug) {
      console.debug('orderedMessages', orderedMessages);
    }

    // Convert Message documents into appropriate ChatMessage instances
    const chatMessages = orderedMessages.map((msg) =>
      msg?.isCreatedByUser || msg?.role.toLowerCase() === 'user' ? new HumanChatMessage(msg.text) : new AIChatMessage(msg.text)
    );

    this.currentMessages = orderedMessages;

    return chatMessages;
  }

  async saveMessageToDatabase(message, user = null) {
    await saveMessage(message);
    await saveConvo(user, { conversationId: message.conversationId });
  }

  saveLatestAction (action) {
    this.latestAction = action;
  }

  async initialize(conversationId) {
    // TO DO: need to initialize by user
    const model = new ChatOpenAI({
      openAIApiKey: this.openAIApiKey,
      ...this.modelOptions,
      // model: 'gpt-4',
    });
    const tools = [new Calculator(), new WebBrowser({ model, embeddings: new OpenAIEmbeddings() })];
    // const tools = [new Calculator()];

    if (this.options.zapierApiKey) {
      const zapier = new ZapierNLAWrapper({
        apiKey: this.options.zapierApiKey
      });

      const toolkit = await ZapierToolKit.fromZapierNLAWrapper(zapier);
      tools.push(...toolkit.tools);
    }

    if (this.options.serpapiApiKey) {
      tools.push(
        new SerpAPI(this.options.serpapiApiKey, {
          location: 'Austin,Texas,United States',
          hl: 'en',
          gl: 'us'
        })
      );
    }

    const pastMessages = await this.loadHistory(conversationId, this.options?.parentMessageId);

    const handleAction = (action) => {
      this.saveLatestAction(action);

      if (this.options.debug) {
        console.debug('Latest Agent Action ', this.latestAction);
      }
    }

    this.executor = await initializeCustomAgent({
      tools,
      model,
      pastMessages,
      verbose: true,
      returnIntermediateSteps: true,
      callbackManager: CallbackManager.fromHandlers({
        async handleAgentAction(action) {
          // console.log('handleAgentAction', action);
          handleAction(action);
        }
      })
    });

    if (this.options.debug) {
      console.debug('Loaded agent.');
    }
  }

  async sendApiMessage(messages, userMessage, opts = {}) {
    let payload;
    // Doing it this way instead of having each message be a separate element in the array seems to be more reliable,
    // especially when it comes to keeping the AI in character. It also seems to improve coherency and context retention.
    payload = await this.buildPrompt(messages, userMessage);

    let reply = '';
    let result = null;
    if (typeof opts.onProgress === 'function') {
      await this.getCompletion(
        payload,
        (progressMessage) => {
          if (progressMessage === '[DONE]') {
            return;
          }
          const token = this.isChatGptModel
            ? progressMessage.choices[0].delta.content
            : progressMessage.choices[0].text;
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
        opts.abortController || new AbortController()
      );
    } else {
      result = await this.getCompletion(payload, null, opts.abortController || new AbortController());
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

    return reply.trim();
  }

  async sendMessage(message, opts = {}) {
    if (opts && typeof opts === 'object') {
      this.setOptions(opts);
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

    await this.saveMessageToDatabase(userMessage, user);

    let reply = '';
    let result;
    let errorMessage = '';
    const maxAttempts = 3;
    
    for (let attempts = 1; attempts <= maxAttempts; attempts++) {

      const input = attempts < maxAttempts ? message : `You encountered an error with the human's last message. Please try again.
      
      Last message: ${message}

      Error: ${errorMessage}
      
      Your last action that triggered the error: ${JSON.stringify(this.latestAction)}
      `;

      if (this.options.debug) {
        console.debug(`Attempt ${attempts} of ${maxAttempts}`);
      }

      if (this.options.debug && errorMessage.length > 0) {
        console.debug('Caught error, input:', input);
      }

      try {
        result = await this.executor.call({ input });
        break; // Exit the loop if the function call is successful
      } catch (err) {
        console.error(err);
        errorMessage = err.message;
        if (attempts > maxAttempts) {
          return `I'm sorry, I'm having trouble with your latest message. Error: ${err.message}`;
        }
      }
    }
    
    reply = result.output.trim();

    const currentDateString = new Date().toLocaleDateString('en-us', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    // const promptPrefix = `You are ChatGPT, a large language model trained by OpenAI. Your current task is to review the response you generated using a list of plugins. 
    const promptPrefix = `As ChatGPT, review your generated response using plugins.

    Plugins Used: ${this.extractToolValues(result.intermediateSteps)}

    Response: ${reply}
    
    If the response is accurate or appropriate, reply conversationally. Otherwise, attempt to answer again or admit an answer cannot be given. Always maintain a conversational tone. 
    Current date: ${currentDateString}${this.endToken}\n\n`;

    if (this.options.debug) {
      console.debug('promptPrefix', promptPrefix);
    }

    this.options = {
      ...this.options,
      promptPrefix
    };

    const finalReply = await this.sendApiMessage(this.currentMessages, userMessage);

    const replyMessage = {
      messageId: crypto.randomUUID(),
      conversationId,
      parentMessageId: userMessage.messageId,
      sender: 'ChatGPT',
      text: finalReply,
      isCreatedByUser: false
    };

    await this.saveMessageToDatabase(replyMessage, user);

    // if (shouldGenerateTitle) {
    //   conversation.title = await this.generateTitle(userMessage, replyMessage);
    //   returnData.title = conversation.title;
    // }

    // await this.conversationsCache.set(conversationId, conversation);

    return { ...replyMessage, ...result };
  }

  async buildPrompt(messages, userMessage, isChatGptModel = true) {
    if (this.options.debug) {
      console.debug('buildPrompt messages', messages);
    }

    const orderedMessages = [
      ...messages,
      {
        messageId: userMessage.messageId,
        parentMessageId: userMessage.parentMessageId,
        role: 'User',
        text: userMessage.text
      }
    ];

    let promptPrefix;
    if (this.options.promptPrefix) {
      promptPrefix = this.options.promptPrefix.trim();
      // If the prompt prefix doesn't end with the end token, add it.
      if (!promptPrefix.endsWith(`${this.endToken}`)) {
        promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
      }
      promptPrefix = `${this.startToken}Instructions:\n${promptPrefix}`;
    } else {
      const currentDateString = new Date().toLocaleDateString('en-us', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      promptPrefix = `${this.startToken}Instructions:\nYou are ChatGPT, a large language model trained by OpenAI. Respond conversationally.\nCurrent date: ${currentDateString}${this.endToken}\n\n`;
    }

    const promptSuffix = `${this.startToken}${this.chatGptLabel}:\n`; // Prompt ChatGPT to respond.

    const instructionsPayload = {
      role: 'system',
      name: 'instructions',
      content: promptPrefix
    };

    const messagePayload = {
      role: 'system',
      content: promptSuffix
    };

    let currentTokenCount;
    if (isChatGptModel) {
      currentTokenCount =
        this.getTokenCountForMessage(instructionsPayload) + this.getTokenCountForMessage(messagePayload);
    } else {
      currentTokenCount = this.getTokenCount(`${promptPrefix}${promptSuffix}`);
    }
    let promptBody = '';
    const maxTokenCount = this.maxPromptTokens;

    // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    // Do this within a recursive async function so that it doesn't block the event loop for too long.
    const buildPromptBody = async () => {
      if (currentTokenCount < maxTokenCount && orderedMessages.length > 0) {
        const message = orderedMessages.pop();
        // const roleLabel = message.role === 'User' ? this.userLabel : this.chatGptLabel;
        const roleLabel = message.role;
        const messageString = `${this.startToken}${roleLabel}:\n${message.text}${this.endToken}\n`;
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

        const tokenCountForMessage = this.getTokenCount(messageString);
        const newTokenCount = currentTokenCount + tokenCountForMessage;
        if (newTokenCount > maxTokenCount) {
          if (promptBody) {
            // This message would put us over the token limit, so don't add it.
            return false;
          }
          // This is the first message, so we can't add it. Just throw an error.
          throw new Error(
            `Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`
          );
        }
        promptBody = newPromptBody;
        currentTokenCount = newTokenCount;
        // wait for next tick to avoid blocking the event loop
        await new Promise((resolve) => setTimeout(resolve, 0));
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
    this.modelOptions.max_tokens = Math.min(
      this.maxContextTokens - currentTokenCount,
      this.maxResponseTokens
    );

    if (isChatGptModel) {
      return [instructionsPayload, messagePayload];
    }
    return prompt;
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
      const message = messages.find((m) => m.messageId === currentMessageId);
      if (!message) {
        break;
      }
      orderedMessages.unshift(message);
      currentMessageId = message.parentMessageId;
    }

    if (orderedMessages.length === 0) {
      return [];
    }

    return orderedMessages.map((msg) => ({
      messageId: msg.messageId,
      parentMessageId: msg.parentMessageId,
      role: msg.isCreatedByUser ? 'User' : 'ChatGPT',
      text: msg.text
    }));
  }

  /**
   * Extracts the action tool values from the intermediate steps array.
   * Each step object in the array contains an action object with a tool property.
   * This function returns an array of tool values.
   *
   * @param {Object[]} intermediateSteps - An array of intermediate step objects.
   * @returns {string} An string of action tool values from each step.
   */
  extractToolValues(intermediateSteps) {
    const tools = intermediateSteps.map((step) => step.action.tool);

    if (tools.length === 0) {
      return '';
    }

    const uniqueTools = [...new Set(tools)];

    if (tools.length === 1) {
      return tools[0] + ' plugin';
    }

    return uniqueTools.join(' plugin, ');
  }
}

module.exports = CustomChatAgent;
