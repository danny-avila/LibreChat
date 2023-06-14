const crypto = require('crypto');
const { genAzureChatCompletion } = require('../../utils/genAzureEndpoints');
const {
  encoding_for_model: encodingForModel,
  get_encoding: getEncoding
} = require('@dqbd/tiktoken');
const { fetchEventSource } = require('@waylaidwanderer/fetch-event-source');
const { Agent, ProxyAgent } = require('undici');
// const TextStream = require('../stream');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { CallbackManager } = require('langchain/callbacks');
const { HumanChatMessage, AIChatMessage } = require('langchain/schema');
const { initializeCustomAgent, initializeFunctionsAgent } = require('./agents/');
const { getMessages, saveMessage, saveConvo } = require('../../models');
const { loadTools, SelfReflectionTool } = require('./tools');
const {
  instructions,
  imageInstructions,
  errorInstructions,
  completionInstructions
} = require('./instructions');

const tokenizersCache = {};

class ChatAgent {
  constructor(apiKey, options = {}) {
    this.tools = [];
    this.actions = [];
    this.openAIApiKey = apiKey;
    this.azure = options.azure || false;
    if (this.azure) {
      const { azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName, azureOpenAIApiVersion } =
        this.azure;
      this.azureEndpoint = genAzureChatCompletion({
        azureOpenAIApiInstanceName,
        azureOpenAIApiDeploymentName,
        azureOpenAIApiVersion
      });
    }
    this.setOptions(options);
    this.executor = null;
    this.currentDateString = new Date().toLocaleDateString('en-us', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  getActions(input = null) {
    let output = 'Internal thoughts & actions taken:\n"';
    let actions = input || this.actions;

    if (actions[0]?.action && this.functionsAgent) {
      actions = actions.map((step) => ({
        log: `Action: ${step.action?.tool || ''}\nInput: ${step.action?.toolInput?.input || ''}\nObservation: ${step.observation}`
      }));
    } else if (actions[0]?.action) {
      actions = actions.map((step) => ({
        log: `${step.action.log}\nObservation: ${step.observation}`
      }));
    }

    actions.forEach((actionObj, index) => {
      output += `${actionObj.log}`;
      if (index < actions.length - 1) {
        output += '\n';
      }
    });

    return output + '"';
  }

  buildErrorInput(message, errorMessage) {
    const log = errorMessage.includes('Could not parse LLM output:')
      ? `A formatting error occurred with your response to the human's last message. You didn't follow the formatting instructions. Remember to ${instructions}`
      : `You encountered an error while replying to the human's last message. Attempt to answer again or admit an answer cannot be given.\nError: ${errorMessage}`;

    return `
      ${log}

      ${this.getActions()}

      Human's last message: ${message}
      `;
  }

  buildPromptPrefix(result, message) {
    if ((result.output && result.output.includes('N/A')) || result.output === undefined) {
      return null;
    }

    if (
      result?.intermediateSteps?.length === 1 &&
      result?.intermediateSteps[0]?.action?.toolInput === 'N/A'
    ) {
      return null;
    }

    const internalActions =
      result?.intermediateSteps?.length > 0
        ? this.getActions(result.intermediateSteps)
        : 'Internal Actions Taken: None';

    const toolBasedInstructions = internalActions.toLowerCase().includes('image')
      ? imageInstructions
      : '';

    const errorMessage = result.errorMessage ? `${errorInstructions} ${result.errorMessage}\n` : '';

    const preliminaryAnswer =
      result.output?.length > 0 ? `Preliminary Answer: "${result.output.trim()}"` : '';
    const prefix = preliminaryAnswer
      ? `review and improve the answer you generated using plugins in response to the User Message below. The user hasn't seen your answer or thoughts yet.`
      : 'respond to the User Message below based on your preliminary thoughts & actions.';

    return `As a helpful AI Assistant, ${prefix}${errorMessage}\n${internalActions}
${preliminaryAnswer}
Reply conversationally to the User based on your ${
  preliminaryAnswer ? 'preliminary answer, ' : ''
}internal actions, thoughts, and observations, making improvements wherever possible, but do not modify URLs.
${
  preliminaryAnswer
    ? ''
    : '\nIf there is an incomplete thought or action, you are expected to complete it in your response now.\n'
}You must cite sources if you are using any web links. ${toolBasedInstructions}
Only respond with your conversational reply to the following User Message:
"${message}"`;
  }

  setOptions(options) {
    if (this.options && !this.options.replaceOptions) {
      // nested options aren't spread properly, so we need to do this manually
      this.options.modelOptions = {
        ...this.options.modelOptions,
        ...options.modelOptions
      };
      this.options.agentOptions = {
        ...this.options.agentOptions,
        ...options.agentOptions
      };
      delete options.modelOptions;
      delete options.agentOptions;
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
      model: modelOptions.model || 'gpt-3.5-turbo',
      temperature: typeof modelOptions.temperature === 'undefined' ? 0.8 : modelOptions.temperature,
      top_p: typeof modelOptions.top_p === 'undefined' ? 1 : modelOptions.top_p,
      presence_penalty:
        typeof modelOptions.presence_penalty === 'undefined' ? 0 : modelOptions.presence_penalty,
      frequency_penalty:
        typeof modelOptions.frequency_penalty === 'undefined' ? 0 : modelOptions.frequency_penalty,
      stop: modelOptions.stop
    };

    this.agentOptions = this.options.agentOptions || {};
    this.functionsAgent = this.agentOptions.agent === 'functions';
    this.agentIsGpt3 = this.agentOptions.model.startsWith('gpt-3');
    if (this.functionsAgent) {
      this.agentOptions.model = this.getFunctionModelName(this.agentOptions.model);
    }

    this.isChatGptModel = this.modelOptions.model.startsWith('gpt-');
    this.isGpt3 = this.modelOptions.model.startsWith('gpt-3');
    const maxTokensMap = {
      'gpt-4': 8191,
      'gpt-4-0613': 8191,
      'gpt-4-32k': 32767,
      'gpt-4-32k-0613': 32767,
      'gpt-3.5-turbo': 4095,
      'gpt-3.5-turbo-0613': 4095,
      'gpt-3.5-turbo-0301': 4095,
      'gpt-3.5-turbo-16k': 15999,
    };
  
    this.maxContextTokens = maxTokensMap[this.modelOptions.model] ?? 4095; // 1 less than maximum
    // Reserve 1024 tokens for the response.
    // The max prompt tokens is determined by the max context tokens minus the max response tokens.
    // Earlier messages will be dropped until the prompt is within the limit.
    this.maxResponseTokens = this.modelOptions.max_tokens || 1024;
    this.maxPromptTokens =
      this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`
      );
    }

    this.userLabel = this.options.userLabel || 'User';
    this.chatGptLabel = this.options.chatGptLabel || 'Assistant';

    // Use these faux tokens to help the AI understand the context since we are building the chat log ourselves.
    // Trying to use "<|im_start|>" causes the AI to still generate "<" or "<|" at the end sometimes for some reason,
    // without tripping the stop sequences, so I'm using "||>" instead.
    this.startToken = '||>';
    this.endToken = '';
    this.gptEncoder = this.constructor.getTokenizer('cl100k_base');
    this.completionsUrl = 'https://api.openai.com/v1/chat/completions';
    this.reverseProxyUrl = this.options.reverseProxyUrl || process.env.OPENAI_REVERSE_PROXY;

    if (this.reverseProxyUrl) {
      this.completionsUrl = this.reverseProxyUrl;
      this.langchainProxy = this.reverseProxyUrl.substring(0, this.reverseProxyUrl.indexOf('v1') + 'v1'.length)
    }

    if (this.azureEndpoint) {
      this.completionsUrl = this.azureEndpoint;
    }

    if (this.azureEndpoint && this.options.debug) {
      console.debug(`Using Azure endpoint: ${this.azureEndpoint}`, this.azure);
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

    const modelOptions = this.modelOptions;
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

    if (this.azureEndpoint) {
      opts.headers['api-key'] = this.azure.azureOpenAIApiKey;
    } else if (this.openAIApiKey) {
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
                // console.debug(response);
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
    if (this.options.debug) {
      console.debug('Loading history for conversation', conversationId, parentMessageId);
    }

    const messages = (await getMessages({ conversationId })) || [];

    if (messages.length === 0) {
      this.currentMessages = [];
      return [];
    }

    const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);
    // Convert Message documents into appropriate ChatMessage instances
    const chatMessages = orderedMessages.map((msg) =>
      msg?.isCreatedByUser || msg?.role.toLowerCase() === 'user'
        ? new HumanChatMessage(msg.text)
        : new AIChatMessage(msg.text)
    );

    this.currentMessages = orderedMessages;

    return chatMessages;
  }

  async saveMessageToDatabase(message, user = null) {
    await saveMessage({ ...message, unfinished: false });
    await saveConvo(user, {
      conversationId: message.conversationId,
      endpoint: 'gptPlugins',
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      ...this.modelOptions,
      agentOptions: this.agentOptions
    });
  }

  saveLatestAction(action) {
    this.actions.push(action);
  }

  getFunctionModelName(input) {
    const prefixMap = {
      'gpt-4': 'gpt-4-0613',
      'gpt-4-32k': 'gpt-4-32k-0613',
      'gpt-3.5-turbo': 'gpt-3.5-turbo-0613'
    };
  
    const prefix = Object.keys(prefixMap).find(key => input.startsWith(key));
    return prefix ? prefixMap[prefix] : 'gpt-3.5-turbo-0613';
  }

  createLLM(modelOptions, configOptions) {
    let credentials = { openAIApiKey: this.openAIApiKey };
    if (this.azure) {
      credentials = { ...this.azure };
    }
  
    return new ChatOpenAI({ credentials, ...modelOptions }, configOptions);
  }

  async initialize({ user, message, onAgentAction, onChainEnd, signal }) {
    const modelOptions = {
      modelName: this.agentOptions.model,
      temperature: this.agentOptions.temperature
    };

    const configOptions = {};

    if (this.langchainProxy) {
      configOptions.basePath = this.langchainProxy;
    }

    const model = this.createLLM(modelOptions, configOptions);

    if (this.options.debug) {
      console.debug(`<-----Agent Model: ${model.modelName} | Temp: ${model.temperature}----->`);
    }

    this.availableTools = await loadTools({
      user,
      model,
      tools: this.options.tools,
      options: {
        openAIApiKey: this.openAIApiKey
      }
    });
    // load tools
    for (const tool of this.options.tools) {
      const validTool = this.availableTools[tool];

      if (tool === 'plugins') {
        const plugins = await validTool();
        this.tools = [...this.tools, ...plugins];
      } else if (validTool) {
        this.tools.push(await validTool());
      }
    }

    if (this.options.debug) {
      console.debug('Requested Tools');
      console.debug(this.options.tools);
      console.debug('Loaded Tools');
      console.debug(this.tools.map((tool) => tool.name));
    }

    if (this.tools.length > 0 && !this.functionsAgent) {
      this.tools.push(new SelfReflectionTool({ message, isGpt3: false }));
    } else if (this.tools.length === 0) {
      return;
    }

    const handleAction = (action, callback = null) => {
      this.saveLatestAction(action);

      if (this.options.debug) {
        console.debug('Latest Agent Action ', this.actions[this.actions.length - 1]);
      }

      if (typeof callback === 'function') {
        callback(action);
      }
    };

    // initialize agent
    const initializer = this.options.agentOptions?.agent === 'functions' ? initializeFunctionsAgent : initializeCustomAgent;
    this.executor = await initializer({
      model,
      signal,
      tools: this.tools,
      pastMessages: this.pastMessages,
      currentDateString: this.currentDateString,
      verbose: this.options.debug,
      returnIntermediateSteps: true,
      callbackManager: CallbackManager.fromHandlers({
        async handleAgentAction(action) {
          handleAction(action, onAgentAction);
        },
        async handleChainEnd(action) {
          if (typeof onChainEnd === 'function') {
            onChainEnd(action);
          }
        }
      })
    });

    if (this.options.debug) {
      console.debug('Loaded agent.');
    }
  }

  async sendApiMessage(messages, userMessage, opts = {}) {
    // Doing it this way instead of having each message be a separate element in the array seems to be more reliable,
    // especially when it comes to keeping the AI in character. It also seems to improve coherency and context retention.
    let payload = await this.buildPrompt({
      messages: [
        ...messages,
        {
          messageId: userMessage.messageId,
          parentMessageId: userMessage.parentMessageId,
          role: 'User',
          text: userMessage.text
        }
      ],
      ...opts
    });

    let reply = '';
    let result = {};
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

          if (token === this.endToken) {
            return;
          }
          opts.onProgress(token);
          reply += token;
        },
        opts.abortController || new AbortController()
      );
    } else {
      result = await this.getCompletion(
        payload,
        null,
        opts.abortController || new AbortController()
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

    if (this.options.debug) {
      console.debug();
    }

    return reply.trim();
  }

  async executorCall(message, signal) {
    let errorMessage = '';
    const maxAttempts = 1;

    for (let attempts = 1; attempts <= maxAttempts; attempts++) {
      const errorInput = this.buildErrorInput(message, errorMessage);
      const input = attempts > 1 ? errorInput : message;

      if (this.options.debug) {
        console.debug(`Attempt ${attempts} of ${maxAttempts}`);
      }

      if (this.options.debug && errorMessage.length > 0) {
        console.debug('Caught error, input:', input);
      }

      try {
        this.result = await this.executor.call({ input, signal });
        break; // Exit the loop if the function call is successful
      } catch (err) {
        console.error(err);
        errorMessage = err.message;
        if (attempts === maxAttempts) {
          this.result.output = `Encountered an error while attempting to respond. Error: ${err.message}`;
          this.result.intermediateSteps = this.actions;
          this.result.errorMessage = errorMessage;
          break;
        }
      }
    }
  }

  async sendMessage(message, opts = {}) {
    if (opts && typeof opts === 'object') {
      this.setOptions(opts);
    }
    console.log('sendMessage', message, opts);

    const user = opts.user || null;
    const { onAgentAction, onChainEnd } = opts;
    const conversationId = opts.conversationId || crypto.randomUUID();
    const parentMessageId = opts.parentMessageId || '00000000-0000-0000-0000-000000000000';
    const userMessageId = opts.overrideParentMessageId || crypto.randomUUID();
    const responseMessageId = crypto.randomUUID();
    this.pastMessages = await this.loadHistory(conversationId, this.options?.parentMessageId);

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

    if (typeof opts?.onStart === 'function') {
      opts.onStart(userMessage);
    }

    await this.saveMessageToDatabase(userMessage, user);

    this.result = {};
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

    const completionMode = this.options.tools.length === 0;
    if (!completionMode) {
      await this.initialize({
        user,
        message,
        onAgentAction,
        onChainEnd,
        signal: opts.abortController.signal
      });
      await this.executorCall(message, opts.abortController.signal);
    }

    // If message was aborted mid-generation
    if (this.result?.errorMessage?.length > 0 && this.result?.errorMessage?.includes('cancel')) {
      responseMessage.text = 'Cancelled.';
      await this.saveMessageToDatabase(responseMessage, user);
      return { ...responseMessage, ...this.result };
    }

    // if (!this.agentIsGpt3 && this.result.output) {
    //   responseMessage.text = this.result.output;
    //   await this.saveMessageToDatabase(responseMessage, user);
    //   const textStream = new TextStream(this.result.output);
    //   await textStream.processTextStream(opts.onProgress);
    //   return { ...responseMessage, ...this.result };
    // }

    if (this.options.debug) {
      console.debug('this.result', this.result);
    }

    const userProvidedPrefix = completionMode && this.options?.promptPrefix?.length > 0;
    const promptPrefix = userProvidedPrefix
      ? this.options.promptPrefix
      : this.buildPromptPrefix(this.result, message);

    if (this.options.debug) {
      console.debug('promptPrefix', promptPrefix);
    }

    const finalReply = await this.sendApiMessage(this.currentMessages, userMessage, { ...opts, completionMode, promptPrefix });
    responseMessage.text = finalReply;
    await this.saveMessageToDatabase(responseMessage, user);
    return { ...responseMessage, ...this.result };
  }

  async buildPrompt({ messages, promptPrefix: _promptPrefix, completionMode = false, isChatGptModel = true }) {
    if (this.options.debug) {
      console.debug('buildPrompt messages', messages);
    }

    const orderedMessages = messages;
    let promptPrefix = _promptPrefix;
    if (promptPrefix) {
      promptPrefix = promptPrefix.trim();
      // If the prompt prefix doesn't end with the end token, add it.
      if (!promptPrefix.endsWith(`${this.endToken}`)) {
        promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
      }
      promptPrefix = `${this.startToken}Instructions:\n${promptPrefix}`;
    } else {
      promptPrefix = `${this.startToken}${completionInstructions} ${this.currentDateString}${this.endToken}\n\n`;
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

    if (this.isGpt3) {
      instructionsPayload.role = 'user';
      messagePayload.role = 'user';
    }

    if (this.isGpt3 && completionMode) {
      instructionsPayload.content += `\n${promptSuffix}`;
    }

    // testing if this works with browser endpoint
    if (!this.isGpt3 && this.reverseProxyUrl) {
      instructionsPayload.role = 'user';
    }

    let currentTokenCount;
    if (isChatGptModel) {
      currentTokenCount =
        this.getTokenCountForMessage(instructionsPayload) +
        this.getTokenCountForMessage(messagePayload);
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
        let messageString = `${this.startToken}${roleLabel}:\n${message.text}${this.endToken}\n`;
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

    // const prompt = `${promptBody}${promptSuffix}`;
    const prompt = promptBody;
    if (isChatGptModel) {
      messagePayload.content = prompt;
      // Add 2 tokens for metadata after all messages have been counted.
      currentTokenCount += 2;
    }

    if (this.isGpt3 && messagePayload.content.length > 0) {
      const context = `Chat History:\n`;
      messagePayload.content = `${context}${prompt}`;
      currentTokenCount += this.getTokenCount(context);
    }

    // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    this.modelOptions.max_tokens = Math.min(
      this.maxContextTokens - currentTokenCount,
      this.maxResponseTokens
    );

    if (this.isGpt3 && !completionMode) {
      messagePayload.content += promptSuffix;
      return [instructionsPayload, messagePayload];
    }

    if (isChatGptModel) {
      const result = [messagePayload, instructionsPayload];
      return result.filter((message) => message.content.length > 0);
    }

    this.completionPromptTokens = currentTokenCount;
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
      role: msg.isCreatedByUser ? 'User' : 'Assistant',
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

module.exports = ChatAgent;
