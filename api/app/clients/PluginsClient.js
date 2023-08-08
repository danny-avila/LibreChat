const OpenAIClient = require('./OpenAIClient');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { CallbackManager } = require('langchain/callbacks');
const { initializeCustomAgent, initializeFunctionsAgent } = require('./agents/');
// const { findMessageContent } = require('../../utils');
const { loadTools } = require('./tools/util');
const { SelfReflectionTool } = require('./tools/');
const { HumanChatMessage, AIChatMessage } = require('langchain/schema');
const { instructions, imageInstructions, errorInstructions } = require('./prompts/instructions');

class PluginsClient extends OpenAIClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.sender = options.sender ?? 'Assistant';
    this.tools = [];
    this.actions = [];
    this.openAIApiKey = apiKey;
    this.setOptions(options);
    this.executor = null;
  }

  getActions(input = null) {
    let output = 'Internal thoughts & actions taken:\n"';
    let actions = input || this.actions;

    if (actions[0]?.action && this.functionsAgent) {
      actions = actions.map((step) => ({
        log: `Action: ${step.action?.tool || ''}\nInput: ${
          JSON.stringify(step.action?.toolInput) || ''
        }\nObservation: ${step.observation}`,
      }));
    } else if (actions[0]?.action) {
      actions = actions.map((step) => ({
        log: `${step.action.log}\nObservation: ${step.observation}`,
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
      ? 'review and improve the answer you generated using plugins in response to the User Message below. The user hasn\'t seen your answer or thoughts yet.'
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
    this.agentOptions = options.agentOptions;
    this.functionsAgent = this.agentOptions?.agent === 'functions';
    this.agentIsGpt3 = this.agentOptions?.model.startsWith('gpt-3');
    if (this.functionsAgent && this.agentOptions.model) {
      this.agentOptions.model = this.getFunctionModelName(this.agentOptions.model);
    }

    super.setOptions(options);
    this.isGpt3 = this.modelOptions.model.startsWith('gpt-3');

    if (this.options.reverseProxyUrl) {
      this.langchainProxy = this.options.reverseProxyUrl.match(/.*v1/)[0];
    }
  }

  getSaveOptions() {
    return {
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      ...this.modelOptions,
      agentOptions: this.agentOptions,
    };
  }

  saveLatestAction(action) {
    this.actions.push(action);
  }

  getFunctionModelName(input) {
    if (input.startsWith('gpt-3.5-turbo')) {
      return 'gpt-3.5-turbo';
    } else if (input.startsWith('gpt-4')) {
      return 'gpt-4';
    } else {
      return 'gpt-3.5-turbo';
    }
  }

  getBuildMessagesOptions(opts) {
    return {
      isChatCompletion: true,
      promptPrefix: opts.promptPrefix,
      abortController: opts.abortController,
    };
  }

  createLLM(modelOptions, configOptions) {
    let azure = {};
    let credentials = { openAIApiKey: this.openAIApiKey };
    let configuration = {
      apiKey: this.openAIApiKey,
    };

    if (this.azure) {
      credentials = {};
      configuration = {};
      ({ azure } = this);
    }

    if (this.options.debug) {
      console.debug('createLLM: configOptions');
      console.debug(configOptions);
    }

    return new ChatOpenAI({ credentials, configuration, ...azure, ...modelOptions }, configOptions);
  }

  async initialize({ user, message, onAgentAction, onChainEnd, signal }) {
    const modelOptions = {
      modelName: this.agentOptions.model,
      temperature: this.agentOptions.temperature,
    };

    const configOptions = {};

    if (this.langchainProxy) {
      configOptions.basePath = this.langchainProxy;
    }

    const model = this.createLLM(modelOptions, configOptions);

    if (this.options.debug) {
      console.debug(
        `<-----Agent Model: ${model.modelName} | Temp: ${model.temperature} | Functions: ${this.functionsAgent}----->`,
      );
    }

    this.availableTools = await loadTools({
      user,
      model,
      tools: this.options.tools,
      functions: this.functionsAgent,
      options: {
        openAIApiKey: this.openAIApiKey,
        conversationId: this.conversationId,
        debug: this.options?.debug,
        message,
      },
    });
    // load tools
    for (const tool of this.options.tools) {
      const validTool = this.availableTools[tool];
      const plugin = await validTool();

      if (Array.isArray(plugin)) {
        this.tools = [...this.tools, ...plugin];
      } else if (plugin) {
        this.tools.push(plugin);
      }
    }

    if (this.tools.length > 0 && !this.functionsAgent) {
      this.tools.push(new SelfReflectionTool({ message, isGpt3: false }));
    } else if (this.tools.length === 0) {
      return;
    }

    if (this.options.debug) {
      console.debug('Requested Tools');
      console.debug(this.options.tools);
      console.debug('Loaded Tools');
      console.debug(this.tools.map((tool) => tool.name));
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

    // Map Messages to Langchain format
    const pastMessages = this.currentMessages
      .slice(0, -1)
      .map((msg) =>
        msg?.isCreatedByUser || msg?.role?.toLowerCase() === 'user'
          ? new HumanChatMessage(msg.text)
          : new AIChatMessage(msg.text),
      );

    // initialize agent
    const initializer = this.functionsAgent ? initializeFunctionsAgent : initializeCustomAgent;
    this.executor = await initializer({
      model,
      signal,
      pastMessages,
      tools: this.tools,
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
        },
      }),
    });

    if (this.options.debug) {
      console.debug('Loaded agent.');
    }
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
        let content = '';
        // try {
        //   content = findMessageContent(message);
        // } catch (error) {
        //   console.error('Encountered an error while attempting to respond. Error: ', error);
        //   break;
        // }
        if (content) {
          errorMessage = content;
          break;
        }
        if (attempts === maxAttempts) {
          this.result.output = `Encountered an error while attempting to respond. Error: ${err.message}`;
          this.result.intermediateSteps = this.actions;
          this.result.errorMessage = errorMessage;
          break;
        }
      }
    }
  }

  addImages(intermediateSteps, responseMessage) {
    if (!intermediateSteps || !responseMessage) {
      return;
    }

    intermediateSteps.forEach((step) => {
      const { observation } = step;
      if (!observation || !observation.includes('![')) {
        return;
      }

      // Extract the image file path from the observation
      const observedImagePath = observation.match(/\(\/images\/.*\.\w*\)/g)[0];

      // Check if the responseMessage already includes the image file path
      if (!responseMessage.text.includes(observedImagePath)) {
        // If the image file path is not found, append the whole observation
        responseMessage.text += '\n' + observation;
        if (this.options.debug) {
          console.debug('added image from intermediateSteps');
        }
      }
    });
  }

  async handleResponseMessage(responseMessage, saveOptions, user) {
    responseMessage.tokenCount = this.getTokenCountForResponse(responseMessage);
    responseMessage.completionTokens = responseMessage.tokenCount;
    await this.saveMessageToDatabase(responseMessage, saveOptions, user);
    delete responseMessage.tokenCount;
    return { ...responseMessage, ...this.result };
  }

  async sendMessage(message, opts = {}) {
    // If a message is edited, no tools can be used.
    const completionMode = this.options.tools.length === 0 || opts.isEdited;
    if (completionMode) {
      this.setOptions(opts);
      return super.sendMessage(message, opts);
    }
    console.log('Plugins sendMessage', message, opts);
    const {
      user,
      conversationId,
      responseMessageId,
      saveOptions,
      userMessage,
      onAgentAction,
      onChainEnd,
    } = await this.handleStartMethods(message, opts);

    this.conversationId = conversationId;
    this.currentMessages.push(userMessage);

    let {
      prompt: payload,
      tokenCountMap,
      promptTokens,
      messages,
    } = await this.buildMessages(
      this.currentMessages,
      userMessage.messageId,
      this.getBuildMessagesOptions({
        promptPrefix: null,
        abortController: this.abortController,
      }),
    );

    if (tokenCountMap) {
      console.dir(tokenCountMap, { depth: null });
      if (tokenCountMap[userMessage.messageId]) {
        userMessage.tokenCount = tokenCountMap[userMessage.messageId];
        console.log('userMessage.tokenCount', userMessage.tokenCount);
      }
      payload = payload.map((message) => {
        const messageWithoutTokenCount = message;
        delete messageWithoutTokenCount.tokenCount;
        return messageWithoutTokenCount;
      });
      this.handleTokenCountMap(tokenCountMap);
    }

    this.result = {};
    if (messages) {
      this.currentMessages = messages;
    }
    await this.saveMessageToDatabase(userMessage, saveOptions, user);
    const responseMessage = {
      messageId: responseMessageId,
      conversationId,
      parentMessageId: userMessage.messageId,
      isCreatedByUser: false,
      model: this.modelOptions.model,
      sender: this.sender,
      promptTokens,
    };

    await this.initialize({
      user,
      message,
      onAgentAction,
      onChainEnd,
      signal: this.abortController.signal,
    });
    await this.executorCall(message, this.abortController.signal);

    // If message was aborted mid-generation
    if (this.result?.errorMessage?.length > 0 && this.result?.errorMessage?.includes('cancel')) {
      responseMessage.text = 'Cancelled.';
      return await this.handleResponseMessage(responseMessage, saveOptions, user);
    }

    if (this.agentOptions.skipCompletion && this.result.output) {
      responseMessage.text = this.result.output;
      this.addImages(this.result.intermediateSteps, responseMessage);
      await this.generateTextStream(this.result.output, opts.onProgress, { delay: 8 });
      return await this.handleResponseMessage(responseMessage, saveOptions, user);
    }

    if (this.options.debug) {
      console.debug('Plugins completion phase: this.result');
      console.debug(this.result);
    }

    const promptPrefix = this.buildPromptPrefix(this.result, message);

    if (this.options.debug) {
      console.debug('Plugins: promptPrefix');
      console.debug(promptPrefix);
    }

    payload = await this.buildCompletionPrompt({
      messages: this.currentMessages,
      promptPrefix,
    });

    if (this.options.debug) {
      console.debug('buildCompletionPrompt Payload');
      console.debug(payload);
    }
    responseMessage.text = await this.sendCompletion(payload, opts);
    return await this.handleResponseMessage(responseMessage, saveOptions, user);
  }

  async buildCompletionPrompt({ messages, promptPrefix: _promptPrefix }) {
    if (this.options.debug) {
      console.debug('buildCompletionPrompt messages', messages);
    }

    const orderedMessages = messages;
    let promptPrefix = _promptPrefix.trim();
    // If the prompt prefix doesn't end with the end token, add it.
    if (!promptPrefix.endsWith(`${this.endToken}`)) {
      promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
    }
    promptPrefix = `${this.startToken}Instructions:\n${promptPrefix}`;
    const promptSuffix = `${this.startToken}${this.chatGptLabel ?? 'Assistant'}:\n`;

    const instructionsPayload = {
      role: 'system',
      name: 'instructions',
      content: promptPrefix,
    };

    const messagePayload = {
      role: 'system',
      content: promptSuffix,
    };

    if (this.isGpt3) {
      instructionsPayload.role = 'user';
      messagePayload.role = 'user';
      instructionsPayload.content += `\n${promptSuffix}`;
    }

    // testing if this works with browser endpoint
    if (!this.isGpt3 && this.options.reverseProxyUrl) {
      instructionsPayload.role = 'user';
    }

    let currentTokenCount =
      this.getTokenCountForMessage(instructionsPayload) +
      this.getTokenCountForMessage(messagePayload);

    let promptBody = '';
    const maxTokenCount = this.maxPromptTokens;
    // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    // Do this within a recursive async function so that it doesn't block the event loop for too long.
    const buildPromptBody = async () => {
      if (currentTokenCount < maxTokenCount && orderedMessages.length > 0) {
        const message = orderedMessages.pop();
        const isCreatedByUser = message.isCreatedByUser || message.role?.toLowerCase() === 'user';
        const roleLabel = isCreatedByUser ? this.userLabel : this.chatGptLabel;
        let messageString = `${this.startToken}${roleLabel}:\n${message.text}${this.endToken}\n`;
        let newPromptBody = `${messageString}${promptBody}`;

        const tokenCountForMessage = this.getTokenCount(messageString);
        const newTokenCount = currentTokenCount + tokenCountForMessage;
        if (newTokenCount > maxTokenCount) {
          if (promptBody) {
            // This message would put us over the token limit, so don't add it.
            return false;
          }
          // This is the first message, so we can't add it. Just throw an error.
          throw new Error(
            `Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`,
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
    const prompt = promptBody;
    messagePayload.content = prompt;
    // Add 2 tokens for metadata after all messages have been counted.
    currentTokenCount += 2;

    if (this.isGpt3 && messagePayload.content.length > 0) {
      const context = 'Chat History:\n';
      messagePayload.content = `${context}${prompt}`;
      currentTokenCount += this.getTokenCount(context);
    }

    // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    this.modelOptions.max_tokens = Math.min(
      this.maxContextTokens - currentTokenCount,
      this.maxResponseTokens,
    );

    if (this.isGpt3) {
      messagePayload.content += promptSuffix;
      return [instructionsPayload, messagePayload];
    }

    const result = [messagePayload, instructionsPayload];

    if (this.functionsAgent && !this.isGpt3) {
      result[1].content = `${result[1].content}\n${this.startToken}${this.chatGptLabel}:\nSure thing! Here is the output you requested:\n`;
    }

    return result.filter((message) => message.content.length > 0);
  }
}

module.exports = PluginsClient;
